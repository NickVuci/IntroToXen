// The workstation page. Everything musical goes through shared/xen/*; this file is interface only.
//
// It has two views, each a real part of the workstation:
//   scale  the scale builder: the 15-odd-limit palette, presets, the bar diagram, Scala export
//   roll   the piano roll over the current scale: drone, chords and melody
// On its own the page shows both. Opened for a lesson exercise (?lesson=…&task=…) it shows the
// one view that exercise needs, with the exercise's wording and its own three buttons.
import * as T from '../shared/xen/tuning.js';
import * as P from '../shared/xen/project.js';
import * as S from '../shared/xen/scale.js';
import { createStore, exportText, importText, fileName } from '../shared/xen/store.js';
import { createProgress } from '../shared/xen/progress.js';
import { take as takeHandoff, projectFromHandoff } from '../shared/xen/handoff.js';
import { createTransport } from '../shared/xen/transport.js';
import { createXenAudioAdapter, renderWav } from '../shared/xen/audio-adapter.js';

const STEP = P.PPQ / 2;                    // the grid is in eighth notes
const params = new URLSearchParams(window.location.search);
const $ = id => document.getElementById(id);
const el = (tag, className, text) => { const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; };
const svg = (tag, attrs = {}, text) => { const node = document.createElementNS('http://www.w3.org/2000/svg', tag); for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v); if (text !== undefined) node.textContent = text; return node; };
const nowIso = () => new Date().toISOString();
const count = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const show = text => (T.isExact(text) ? text : text.replace(/c$/, '¢'));
const PALETTE = S.palette(15);
const IN_PALETTE = new Set(PALETTE.flatMap(group => group.intervals.map(item => item.text)));

const store = createStore();
const progress = createProgress();
const audio = createXenAudioAdapter(window.XenAudio);
const newId = () => store.newId(Date.now().toString(36));

// ----- what the page is for -----------------------------------------------------------
// mode.view: 'full' (both views), 'scale' or 'roll'. A task adds its wording and finish rule.
const mode = await readMode();
const lastKey = `nv:workstation:last${mode.task ? `:${mode.task.lessonId}:${mode.task.taskId}` : ''}`;
const remember = id => { try { localStorage.setItem(lastKey, id); } catch (e) { /* storage blocked */ } };
const recall = () => { try { return localStorage.getItem(lastKey); } catch (e) { return null; } };

async function readMode() {
  const lessonId = params.get('lesson') || '', taskId = params.get('task') || '';
  if (!taskId) return { view: 'full', task: null, lessonId: /^[\w-]+$/.test(lessonId) ? lessonId : '' };
  if (!/^[\w-]+$/.test(lessonId) || !/^[\w-]+$/.test(taskId)) return { view: 'full', task: null, problem: 'That exercise link is not valid, so this is the full workstation.' };
  try {
    const response = await fetch(`../lessons/${lessonId}.json`, { cache: 'no-store' });
    if (!response.ok) throw new Error(String(response.status));
    const lesson = await response.json();
    const items = (lesson.sections?.exercises?.items ?? []).filter(item => item.task);
    const item = items.find(entry => entry.task === taskId);
    if (!item) throw new Error('unknown task');
    const setup = item.workstation ?? {};
    return {
      view: setup.view === 'scale' ? 'scale' : 'roll',
      task: {
        lessonId, taskId, lessonTitle: String(lesson.title || ''), title: String(item.title || ''), body: String(item.body || ''),
        criteria: item.criteria ?? {}, completeOn: setup.completeOn === 'export' ? 'export' : 'save',
        lane: setup.lane === 'chords' ? 'chords' : 'melody', bars: Number(setup.bars) || 8,
        scaleTask: setup.scaleFrom || items.find(entry => entry.workstation?.view === 'scale')?.task || '',
        all: items.map(entry => ({ id: entry.task, title: String(entry.title || '') })),
        back: `../template.html?lesson=lessons/${lessonId}.json&section=exercises`,
      },
    };
  } catch (error) {
    return { view: 'full', task: null, problem: 'The exercise could not be loaded, so this is the full workstation.' };
  }
}

// ----- state -----------------------------------------------------------------
const ui = { lane: mode.task?.lane ?? 'melody', lengthTick: STEP, range: 1, savedRevision: -1, savedId: null, scaleId: null, taskDone: false, opening: '' };
if (ui.lane === 'chords') ui.lengthTick = P.PPQ * 4;
let history = P.createHistory(startingProject());
let rows = [];
const project = () => history.present;

function freshProject(extra = {}) {
  return P.createProject({ id: newId(), name: 'Untitled', now: nowIso(), ...extra });
}

// The scale the learner saved for this lesson's scale exercise, if there is one.
function lessonScale() {
  if (!mode.task) return null;
  const id = progress.tasks(mode.task.lessonId)[mode.task.scaleTask]?.scaleId;
  return (id && store.loadScale(id)) || null;
}

function startingProject() {
  const task = mode.task;
  if (task) ui.taskDone = progress.tasks(task.lessonId)[task.taskId]?.done === true;
  if (task && mode.view === 'scale') {
    // The scale exercise edits one scale: the one saved for this lesson, or a new one from 1/1.
    const saved = lessonScale();
    ui.scaleId = saved?.id ?? null;
    return freshProject({ name: task.title, origin: { lessonId: task.lessonId, taskId: task.taskId },
      tuning: saved ? { ...saved.tuning, name: saved.name } : { referenceHz: 220, equave: '2/1', scale: ['1/1'] } });
  }
  if (!task) {
    const handoff = takeHandoff();
    if (handoff) { ui.opening = 'Brought in the scale and loops from the lab.'; return projectFromHandoff(handoff, { id: newId(), now: nowIso() }); }
  }
  for (const id of [params.get('project'), recall()]) {
    if (!id) continue;
    try { const saved = store.load(id); if (saved) { ui.savedRevision = saved.revision; ui.savedId = saved.id; return saved; } } catch (e) { /* unreadable: start fresh */ }
  }
  if (task) {
    // A roll exercise starts on the learner's own scale, with the bars the exercise asks for.
    const saved = lessonScale() ?? store.listScales()[0] ?? null;
    ui.opening = saved
      ? `Using your scale, ${saved.name}.`
      : "No saved scale yet, so this uses Ptolemy's intense diatonic. Do the scale exercise first to write in your own.";
    return freshProject({ name: task.title, bars: task.bars, origin: { lessonId: task.lessonId, taskId: task.taskId },
      tuning: saved ? { ...saved.tuning, name: saved.name } : { referenceHz: 220, equave: '2/1', scale: S.PRESETS[0].scale, name: S.PRESETS[0].name } });
  }
  return freshProject();
}

function apply(change, message, target) {
  try {
    history.push(change(project()));
    render();
    if (message !== undefined) say(message, false, target);
    return true;
  } catch (error) {
    say(error.message, true, target);
    return false;
  }
}

function say(text, alert = false, target = $('status')) {
  target.textContent = text;
  target.classList.toggle('alert', alert);
}
const sayScale = (text, alert = false) => say(text, alert, $('scaleStatus'));
// Feedback goes under the view the learner is looking at.
const sayMain = (text, alert = false) => say(text, alert, mode.view === 'scale' ? $('scaleStatus') : $('status'));

function download(text, name, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = el('a'); link.href = url; link.download = name;
  document.body.append(link); link.click(); link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ----- transport -----------------------------------------------------------------
const transport = createTransport({ getProject: project, audio, onState: () => {} });
const playhead = el('div', 'playhead');

async function ready() {
  if (!audio.available()) { sayMain('This browser cannot play audio.', true); return false; }
  if (!(await audio.resume())) { sayMain('Audio is paused while this page is not in view.', true); return false; }
  return true;
}

async function togglePlay() {
  if (transport.playing) { transport.stop(); renderPlay(); return; }
  if (!(await ready())) return;
  transport.play();
  renderPlay();
  window.requestAnimationFrame(movePlayhead);
}

function movePlayhead() {
  if (!transport.playing) { playhead.classList.remove('on'); renderPlay(); return; }
  const cellWidth = parseFloat(getComputedStyle($('rollInner')).getPropertyValue('--cell-w'));
  playhead.style.transform = `translateX(${(transport.state().tick / STEP) * cellWidth}px)`;
  playhead.classList.add('on');
  window.requestAnimationFrame(movePlayhead);
}

// Up the scale to the equave, one note at a time.
async function playScale() {
  if (!(await ready())) return;
  if (transport.playing) { transport.stop(); renderPlay(); }
  audio.cancel();
  const tuning = project().tuning, start = audio.now() + 0.05, gap = 0.34;
  [...tuning.scale, tuning.equave].forEach((text, index) => {
    audio.schedule({ hz: tuning.referenceHz * T.intervalRatio(text), when: start + index * gap, duration: index === tuning.scale.length ? 0.9 : 0.42, velocity: 110, voice: 'pluck', level: 1, kind: 'melody' });
  });
}

// An interval as it is chosen: 1/1 and the new note together, so the lock can be heard.
async function audition(text) {
  if (transport.playing || !audio.available() || !(await audio.resume())) return;
  const hz = project().tuning.referenceHz, when = audio.now() + 0.02;
  audio.schedule({ hz, when, duration: 0.8, velocity: 80, voice: 'soft', level: 1, kind: 'melody' });
  audio.schedule({ hz: hz * T.intervalRatio(text), when, duration: 0.8, velocity: 100, voice: 'pluck', level: 1, kind: 'melody' });
}

function renderPlay() {
  if (mode.view === 'scale') return;
  const button = $('barMain');
  button.textContent = transport.playing ? 'Stop' : 'Play';
  button.classList.toggle('playing', transport.playing);
}

// ----- rendering -------------------------------------------------------------------
function render() {
  const p = project();
  renderStanding(p);
  if (mode.view !== 'roll') renderScale(p);
  if (mode.view !== 'scale') { renderControls(p); renderGrid(p); }
  renderTask(p);
}

function renderStanding(p) {
  if (document.activeElement !== $('projectName')) $('projectName').value = p.name;
  const saved = ui.savedId === p.id && ui.savedRevision === p.revision;
  $('saveState').textContent = mode.view === 'scale' ? '' : saved ? 'Saved' : 'Not saved';
  $('undo').disabled = !history.canUndo;
  $('redo').disabled = !history.canRedo;
}

// ----- scale view ----------------------------------------------------------------------
function renderScale(p) {
  const tuning = p.tuning, about = S.describe(tuning);
  $('scaleMeta').textContent = `${count(about.size, 'note')} · ${about.oddLimit}-odd-limit`;
  if (document.activeElement !== $('scaleName')) $('scaleName').value = tuning.name ?? '';
  if (document.activeElement !== $('referenceHz')) $('referenceHz').value = tuning.referenceHz;
  renderPresets();
  renderDiagram(tuning);
  $('palette').querySelectorAll('button').forEach(button => button.setAttribute('aria-pressed', String(tuning.scale.includes(button.dataset.interval))));
  // Intervals from outside the palette (typed in, or brought from the lab) get chips of their own.
  const chips = $('scaleChips');
  chips.replaceChildren();
  for (const text of tuning.scale.filter(item => item !== '1/1' && !IN_PALETTE.has(item))) {
    const chip = el('span', 'chip');
    chip.append(el('strong', '', show(text)));
    if (T.isExact(text)) chip.append(el('small', '', T.formatCents(T.intervalCents(text))));
    else { const near = T.nearestJi(T.intervalCents(text)); chip.append(el('small', '', `≈ ${near.text} (${near.errorCents >= 0 ? '+' : '−'}${Math.abs(near.errorCents).toFixed(2)}¢)`)); }
    const remove = el('button', '', '×');
    remove.type = 'button';
    remove.setAttribute('aria-label', `Remove ${show(text)} from the scale`);
    remove.addEventListener('click', () => changeScale(S.toggleInterval(project().tuning.scale, text), `Removed ${show(text)}.`));
    chip.append(remove);
    chips.append(chip);
  }
  $('clearScale').disabled = tuning.scale.length < 2;
}

function buildPalette() {
  const box = $('palette');
  for (const group of PALETTE) {
    const row = el('div', 'paletteGroup');
    row.append(el('span', '', `${group.oddLimit}-odd-limit`));
    const buttons = el('div');
    for (const item of group.intervals) {
      const button = el('button', '', item.text);
      button.type = 'button';
      button.dataset.interval = item.text;
      button.title = T.formatCents(item.cents);
      button.setAttribute('aria-label', `${item.text}, ${T.formatCents(item.cents)}`);
      buttons.append(button);
    }
    row.append(buttons);
    box.append(row);
  }
  box.addEventListener('click', event => {
    const text = event.target.dataset?.interval;
    if (!text) return;
    const adding = !project().tuning.scale.includes(text);
    const cents = T.formatCents(T.intervalCents(text));
    if (changeScale(S.toggleInterval(project().tuning.scale, text), adding ? `Added ${text} · ${cents} · ${T.classify(text).oddLimit}-odd-limit.` : `Removed ${text}.`) && adding) audition(text);
  });
}

function changeScale(scale, message) {
  return apply(p => P.setScale(p, scale, nowIso()), message, $('scaleStatus'));
}

let presetKey = '';
function renderPresets() {
  const select = $('presetSelect');
  const saved = store.listScales();
  const key = saved.map(item => `${item.id}:${item.name}`).join('|');
  if (key === presetKey && select.options.length) { select.value = ''; return; }
  presetKey = key;
  const option = (value, label) => { const node = el('option', '', label); node.value = value; return node; };
  const presets = el('optgroup'); presets.label = 'Presets';
  presets.append(...S.PRESETS.map(preset => option(`preset:${preset.id}`, preset.name)));
  select.replaceChildren(option('', 'Choose a scale…'), presets);
  if (saved.length) {
    const mine = el('optgroup'); mine.label = 'Your saved scales';
    mine.append(...saved.map(item => option(`saved:${item.id}`, item.name)));
    select.append(mine);
  }
  select.value = '';
}

// A line from 1/1 to the equave, a bar at every note with its ratio above, the step sizes beneath.
function renderDiagram(tuning) {
  const marks = S.layout(tuning), left = 46, right = 954, axis = 132;
  const x = position => left + position * (right - left);
  const root = $('scaleDiagram');
  root.replaceChildren();
  root.setAttribute('aria-label', `Scale from 1/1 to ${tuning.equave}: ${tuning.scale.map(show).join(', ')}. Steps: ${marks.map(mark => show(mark.step)).join(', ')}.`);
  root.append(svg('line', { class: 'axis', x1: left, x2: right, y1: axis, y2: axis }));
  // Each ratio takes the lowest of four rows where it does not collide with the label before it.
  const rowEnd = [-Infinity, -Infinity, -Infinity, -Infinity];
  const place = (position, text, cls) => {
    const label = show(text), half = label.length * 4.2 + 6, at = x(position);
    let row = rowEnd.findIndex(end => at - half >= end);
    if (row < 0) row = rowEnd.indexOf(Math.min(...rowEnd));
    rowEnd[row] = at + half;
    const y = 100 - row * 24;
    root.append(svg('line', { class: `bar${cls}`, x1: at, x2: at, y1: axis, y2: y + 7 }));
    root.append(svg('text', { class: cls.trim(), x: at, y }, label));
  };
  marks.forEach((mark, index) => place(mark.position, mark.text, index === 0 ? ' end' : ''));
  place(1, tuning.equave, ' end');
  const stepEnd = [-Infinity, -Infinity];
  marks.forEach((mark, index) => {
    const from = x(mark.position), to = x(marks[index + 1]?.position ?? 1), mid = (from + to) / 2;
    const label = show(mark.step), half = label.length * 3.7 + 4;
    let row = stepEnd.findIndex(end => mid - half >= end);
    if (row < 0) row = stepEnd.indexOf(Math.min(...stepEnd));
    stepEnd[row] = mid + half;
    root.append(svg('line', { class: 'tick', x1: mid, x2: mid, y1: axis + 3, y2: axis + 12 + row * 18 }));
    root.append(svg('text', { class: 'step', x: mid, y: axis + 26 + row * 18 }, label));
  });
}

function currentScale() {
  const tuning = project().tuning;
  return S.createScale({ id: ui.scaleId ?? newId(), name: tuning.name, tuning, now: nowIso() });
}

function saveScale() {
  const scale = currentScale();
  if (!store.saveScale(scale)) { sayScale('The browser would not store the scale. Use Export .scl to keep a copy.', true); return; }
  ui.scaleId = scale.id;
  if (!project().tuning.name) history.push(P.setScaleName(project(), scale.name, nowIso()));
  presetKey = '';
  const finished = mode.task && mode.view === 'scale' ? finishTask({ scaleId: scale.id }) : null;
  render();
  sayScale(finished === false ? `Saved ${scale.name}. The exercise still needs more: ${P.checkTask(project(), mode.task.criteria).missing[0]}` : `Saved ${scale.name}.`);
}

// ----- roll view ------------------------------------------------------------------------
// One row per pitch: the scale across the chosen range, the equave on top, and a row for any
// note that lies outside those (a direct-interval note, or one left behind by a scale change).
function buildRows(p) {
  const list = [];
  const add = pitch => {
    const interval = T.pitchInterval(p.tuning, pitch);
    if (!list.some(row => P.samePitch(row.pitch, pitch))) list.push({ pitch, interval, cents: T.intervalCents(interval), inRange: true });
  };
  for (let equaveOffset = 0; equaveOffset < ui.range; equaveOffset += 1) p.tuning.scale.forEach((_, degree) => add({ degree, equaveOffset }));
  add({ degree: 0, equaveOffset: ui.range });
  const standard = list.length;
  p.notes.forEach(note => add(note.pitch));
  list.forEach((row, index) => { row.inRange = index < standard; });
  return list.sort((a, b) => b.cents - a.cents);
}

function renderControls(p) {
  for (const button of $('laneButtons').children) button.setAttribute('aria-pressed', String(button.dataset.lane === ui.lane));
  for (const button of $('lengthButtons').children) button.setAttribute('aria-pressed', String(Number(button.dataset.ticks) === ui.lengthTick));
  if (document.activeElement !== $('tempo')) $('tempo').value = p.tempo;
  $('bars').value = String(p.lengthTick / P.barTicks(p.meter));
  $('range').value = String(ui.range);
  const drone = P.trackOf(p, 'drone').drone;
  $('droneOn').checked = drone.on;
  const select = $('dronePitch');
  select.replaceChildren(...p.tuning.scale.map((text, degree) => { const option = el('option', '', `${show(text)}, one equave below`); option.value = String(degree); return option; }));
  select.value = String(drone.pitch.degree ?? 0);
  $('legendActive').textContent = ui.lane === 'melody' ? 'Melody' : 'Chords';
  $('legendOther').textContent = ui.lane === 'melody' ? 'Chords' : 'Melody';
  $('gridMeta').textContent = `${p.tuning.name ? `${p.tuning.name} · ` : ''}${count(p.notes.length, 'note')} · ${count(p.lengthTick / P.barTicks(p.meter), 'bar')} of ${p.meter.numerator}/${p.meter.denominator}`;
}

let gridKey = '';
function renderGrid(p) {
  rows = buildRows(p);
  const columns = p.lengthTick / STEP;
  const stepsPerBeat = (P.PPQ * 4 / p.meter.denominator) / STEP, stepsPerBar = P.barTicks(p.meter) / STEP;
  const inner = $('rollInner');
  const key = `${columns}|${rows.map(row => row.interval + (row.inRange ? '' : '*')).join(',')}`;
  if (key !== gridKey) {          // rebuild the cells only when the shape of the grid changes
    gridKey = key;
    inner.replaceChildren();
    inner.style.gridTemplateColumns = `var(--label-w) repeat(${columns}, var(--cell-w))`;
    rows.forEach((row, rowIndex) => {
      const isRoot = row.interval === '1/1';
      const label = el('div', `rowLabel${isRoot ? ' root' : ''}${row.inRange ? '' : ' outside'}`, show(row.interval));
      label.title = `${T.formatCents(row.cents)}${row.inRange ? '' : ' · outside the scale'}`;
      inner.append(label);
      for (let column = 0; column < columns; column += 1) {
        const cell = el('button', `cell${column % stepsPerBar === 0 ? ' bar' : column % stepsPerBeat === 0 ? ' beat' : ''}`);
        cell.type = 'button';
        cell.dataset.row = String(rowIndex);
        cell.dataset.column = String(column);
        inner.append(cell);
      }
    });
    const layer = el('div', 'bars');
    layer.id = 'noteLayer';
    layer.append(playhead);
    inner.append(layer);
  }
  const lane = P.trackOf(p, ui.lane).id;
  inner.querySelectorAll('.cell').forEach(cell => {
    const row = rows[Number(cell.dataset.row)], column = Number(cell.dataset.column);
    cell.setAttribute('aria-pressed', String(Boolean(P.noteAt(p, lane, row.pitch, column * STEP))));
    cell.setAttribute('aria-label', `${show(row.interval)}, bar ${Math.floor(column / stepsPerBar) + 1}, step ${(column % stepsPerBar) + 1}`);
  });
  const layer = $('noteLayer');
  layer.querySelectorAll('.noteBar').forEach(node => node.remove());
  for (const note of p.notes) {
    const rowIndex = rows.findIndex(row => P.samePitch(row.pitch, note.pitch));
    const bar = el('div', `noteBar ${note.trackId === lane ? 'active' : 'other'}`);
    bar.style.top = `calc(${rowIndex} * var(--cell-h))`;
    bar.style.left = `calc(${note.startTick / STEP} * var(--cell-w) + 2px)`;
    bar.style.width = `calc(${Math.min(note.durationTick, p.lengthTick - note.startTick) / STEP} * var(--cell-w) - 4px)`;
    layer.append(bar);
  }
}

// ----- the exercise -----------------------------------------------------------------------
function renderTask(p) {
  const task = mode.task;
  $('task').hidden = !task;
  if (!task) return;
  $('taskEyebrow').textContent = task.lessonTitle ? `Exercise · ${task.lessonTitle}` : 'Exercise';
  $('taskTitle').textContent = task.title;
  $('taskBody').textContent = task.body;
  const state = $('taskState');
  state.replaceChildren();
  const back = $('taskBack');
  back.classList.toggle('waiting', !ui.taskDone);
  if (ui.taskDone) { back.removeAttribute('aria-hidden'); back.removeAttribute('tabindex'); } else { back.setAttribute('aria-hidden', 'true'); back.setAttribute('tabindex', '-1'); }
  if (ui.taskDone) {
    const record = progress.tasks(task.lessonId);
    const next = task.all.find(item => record[item.id]?.done !== true);
    state.append(el('span', 'verdict', 'Complete.'), ` ${next ? `Next: ${next.title}.` : 'Every exercise is done, and so is the lesson.'}`);
    return;
  }
  const check = P.checkTask(p, task.criteria);
  const action = mode.view === 'scale' ? 'Save scale' : task.completeOn === 'export' ? 'Export' : 'Save';
  state.textContent = check.done ? `Ready. Press ${action} to finish this exercise.` : check.missing[0];
}

/** Records the exercise as done if the work meets it. Returns true, or false when something is missing. */
function finishTask(extra = {}) {
  const task = mode.task;
  if (!P.checkTask(project(), task.criteria).done) return false;
  progress.setTask(task.lessonId, task.taskId, { done: true, at: nowIso(), ...extra });
  if (progress.allDone(task.lessonId, task.all.map(item => item.id))) progress.complete(task.lessonId);
  ui.taskDone = true;
  return true;
}

// ----- projects ---------------------------------------------------------------------------
function saveProject({ quiet = false } = {}) {
  const stamped = { ...project(), updatedAt: nowIso() };
  if (!store.save(stamped)) { say('The browser would not store the project. Use Export file to keep a copy.', true); return false; }
  history.reset(stamped);          // saving is a clean point; undo starts again from here
  ui.savedRevision = stamped.revision; ui.savedId = stamped.id;
  remember(stamped.id);
  const finished = !quiet && mode.task && mode.view === 'roll' && mode.task.completeOn === 'save' ? finishTask({ projectId: stamped.id }) : null;
  render();
  if (!quiet) say(finished === false ? `Saved. The exercise still needs more: ${P.checkTask(stamped, mode.task.criteria).missing[0]}` : 'Saved.');
  return true;
}

// Exporting keeps a copy in the browser too, so the work is still here on the way back.
function exportProject() {
  saveProject({ quiet: true });
  download(exportText(project()), fileName(project()), 'application/json');
  const finished = mode.task && mode.view === 'roll' && mode.task.completeOn === 'export' ? finishTask({ projectId: project().id }) : null;
  render();
  say(finished === false ? `Exported. The exercise still needs more: ${P.checkTask(project(), mode.task.criteria).missing[0]}` : `Exported ${fileName(project())}.`);
}

function open(next, message) {
  transport.stop();
  history = P.createHistory(next);
  gridKey = '';
  render();
  renderPlay();
  sayMain(message);
}

function renderProjects() {
  const list = $('projectList');
  list.replaceChildren();
  const saved = store.list();
  if (!saved.length) list.append(el('li', '', 'Nothing saved yet.'));
  for (const item of saved) {
    const row = el('li');
    const name = el('span', 'name', item.name);
    name.append(el('small', '', `${count(item.noteCount, 'note')} · ${item.updatedAt.slice(0, 10)}`));
    const openButton = el('button', '', 'Open'); openButton.type = 'button';
    openButton.addEventListener('click', () => {
      try { const loaded = store.load(item.id); ui.savedRevision = loaded.revision; ui.savedId = loaded.id; ui.scaleId = null; remember(loaded.id); $('projectsDialog').close(); open(loaded, `Opened ${loaded.name}.`); }
      catch (error) { say(error.message, true); }
    });
    const removeButton = el('button', '', 'Delete'); removeButton.type = 'button';
    removeButton.setAttribute('aria-label', `Delete ${item.name}`);
    let armed = false;
    removeButton.addEventListener('click', () => {
      if (!armed) { armed = true; removeButton.textContent = 'Delete for good'; return; }
      store.remove(item.id);
      if (ui.savedId === item.id) ui.savedId = null;
      renderProjects(); renderStanding(project());
    });
    row.append(name, openButton, removeButton);
    list.append(row);
  }
}

// ----- wiring: scale view ------------------------------------------------------------------
buildPalette();

$('presetSelect').addEventListener('change', () => {
  const [kind, id] = $('presetSelect').value.split(':');
  const source = kind === 'preset' ? S.PRESETS.find(item => item.id === id) : store.loadScale(id);
  if (!source) return;
  const scale = kind === 'preset' ? source.scale : source.tuning.scale;
  // In the scale exercise there is one lesson scale; elsewhere a preset starts a new scale and a saved one is reopened.
  if (!(mode.task && mode.view === 'scale')) ui.scaleId = kind === 'saved' ? source.id : null;
  apply(p => P.setScaleName(P.setScale(p, scale, nowIso()), source.name, nowIso()),
    kind === 'preset' ? `${source.name}. ${source.note} Change it as you like.` : `Opened ${source.name}.`, $('scaleStatus'));
});
$('scaleName').addEventListener('change', () => apply(p => P.setScaleName(p, $('scaleName').value, nowIso()), undefined, $('scaleStatus')));
$('referenceHz').addEventListener('change', () => {
  const hz = Number($('referenceHz').value);
  if (!(hz >= 20 && hz <= 2000)) { sayScale('1/1 must be between 20 and 2000 Hz.', true); render(); return; }
  apply(p => P.setReferenceHz(p, hz, nowIso()), `1/1 is ${hz} Hz.`, $('scaleStatus'));
});
$('addIntervalForm').addEventListener('submit', event => {
  event.preventDefault();
  const input = $('intervalInput');
  try {
    const { text, exact } = T.parseInterval(input.value);
    if (project().tuning.scale.includes(text)) { sayScale(`${show(text)} is already in the scale.`); return; }
    if (!changeScale([...project().tuning.scale, text], exact ? `Added ${text} · ${T.formatCents(T.intervalCents(text))} · ${T.classify(text).oddLimit}-odd-limit.` : `Added ${show(text)}, an approximate interval.`)) return;
    input.value = '';
    audition(text);
  } catch (error) { sayScale(error.message, true); }
});
$('playScale').addEventListener('click', playScale);
$('saveScale').addEventListener('click', saveScale);
$('clearScale').addEventListener('click', () => changeScale(['1/1'], 'Cleared to 1/1.'));
$('exportScl').addEventListener('click', () => { const scale = currentScale(); download(S.toScl(scale), S.sclFileName(scale), 'text/plain'); sayScale(`Exported ${S.sclFileName(scale)}.`); });
$('exportKbm').addEventListener('click', () => { const scale = currentScale(); download(S.toKbm(scale), S.kbmFileName(scale), 'text/plain'); sayScale(`Exported ${S.kbmFileName(scale)}: 1/1 on MIDI note 60 at ${scale.tuning.referenceHz} Hz.`); });

// ----- wiring: roll view -------------------------------------------------------------------
$('rollInner').addEventListener('click', event => {
  const cell = event.target.closest('.cell');
  if (!cell) return;
  const row = rows[Number(cell.dataset.row)], startTick = Number(cell.dataset.column) * STEP;
  const trackId = P.trackOf(project(), ui.lane).id;
  const adding = !P.noteAt(project(), trackId, row.pitch, startTick);
  if (apply(p => P.toggleNote(p, { trackId, pitch: row.pitch, startTick, durationTick: ui.lengthTick }, nowIso()), '') && adding && !transport.playing) {
    audio.resume().then(ok => { if (ok) audio.audition(T.pitchHz(project().tuning, row.pitch), ui.lane === 'chords' ? 'soft' : 'pluck'); });
  }
  // keep keyboard focus on the same cell after the grid redraws
  $('rollInner').querySelector(`.cell[data-row="${cell.dataset.row}"][data-column="${cell.dataset.column}"]`)?.focus({ preventScroll: true });
});
$('laneButtons').addEventListener('click', event => { const lane = event.target.dataset.lane; if (lane) { ui.lane = lane; if (lane === 'chords' && ui.lengthTick === STEP) ui.lengthTick = P.barTicks(project().meter); render(); } });
$('lengthButtons').addEventListener('click', event => { const ticks = Number(event.target.dataset.ticks); if (ticks) { ui.lengthTick = ticks; render(); } });
$('range').addEventListener('change', () => { ui.range = Number($('range').value); render(); });
$('bars').addEventListener('change', () => apply(p => P.setBars(p, Number($('bars').value), nowIso()), ''));
$('tempo').addEventListener('change', () => apply(p => P.setTempo(p, Number($('tempo').value) || p.tempo, nowIso()), ''));
$('droneOn').addEventListener('change', () => apply(p => P.setDrone(p, { on: $('droneOn').checked }, nowIso()), ''));
$('dronePitch').addEventListener('change', () => apply(p => P.setDrone(p, { pitch: { degree: Number($('dronePitch').value), equaveOffset: -1 } }, nowIso()), ''));
$('projectName').addEventListener('change', () => apply(p => P.setName(p, $('projectName').value, nowIso())));
$('undo').addEventListener('click', () => { history.undo(); gridKey = ''; render(); say('Undone.'); });
$('redo').addEventListener('click', () => { history.redo(); gridKey = ''; render(); say('Redone.'); });
$('clearLane').addEventListener('click', () => apply(p => P.clearTrack(p, P.trackOf(p, ui.lane).id, nowIso()), `Cleared the ${ui.lane} lane. Undo brings it back.`));
$('saveProject').addEventListener('click', () => saveProject());
$('exportFile').addEventListener('click', exportProject);
$('importFile').addEventListener('click', () => $('fileInput').click());
$('fileInput').addEventListener('change', async () => {
  const file = $('fileInput').files[0];
  $('fileInput').value = '';
  if (!file) return;
  try {
    const imported = importText(await file.text());
    // an imported project gets its own id so it never overwrites a saved one
    ui.savedId = null; ui.scaleId = null;
    open({ ...imported, id: newId() }, `Imported ${imported.name}. Save to keep it here.`);
  } catch (error) { say(error.message, true); }
});
$('renderWav').addEventListener('click', async () => {
  say('Rendering…');
  const result = await renderWav(window.XenAudio, project(), fileName(project()).replace(/\.xenproj\.json$/, '.wav'));
  if (!result) { say('This browser cannot render audio files.', true); return; }
  let finished = null;
  if (mode.task && mode.view === 'roll' && mode.task.completeOn === 'export') { saveProject({ quiet: true }); finished = finishTask({ projectId: project().id }); }
  render();
  say(finished === false ? `Saved one pass as a WAV file. The exercise still needs more: ${P.checkTask(project(), mode.task.criteria).missing[0]}` : 'Saved one pass as a WAV file.');
});
$('closeProjects').addEventListener('click', () => $('projectsDialog').close());
$('newProject').addEventListener('click', () => { $('projectsDialog').close(); ui.savedId = null; ui.scaleId = null; open(freshProject(), 'New project.'); });

// ----- the three buttons, by mode ------------------------------------------------------------
function setUpFrame() {
  const left = $('barLeft'), main = $('barMain'), right = $('barRight');
  document.body.dataset.view = mode.view;
  $('scaleCard').hidden = mode.view === 'roll';
  $('rollCard').hidden = mode.view === 'scale';
  if (mode.task) {
    document.title = `${mode.task.title} · Workstation · Nick Vuci`;
    $('appName').textContent = mode.view === 'scale' ? 'Workstation · Scale' : 'Workstation · Piano roll';
    $('taskBack').href = mode.task.back;
    left.textContent = 'Exercises';
    left.addEventListener('click', () => { transport.stop(); window.location.href = mode.task.back; });
    $('projectName').closest('.standing').hidden = mode.view === 'scale';
  } else if (mode.lessonId) {
    // Opened from a lesson's lab: the way back is to the lesson; projects move into the tools.
    left.textContent = 'Back to the lesson';
    left.addEventListener('click', () => { transport.stop(); window.location.href = `../template.html?lesson=lessons/${mode.lessonId}.json&section=lab`; });
    $('openProjects').hidden = false;
  } else {
    left.textContent = 'Projects';
    left.addEventListener('click', () => { renderProjects(); $('projectsDialog').showModal(); });
  }
  $('openProjects').addEventListener('click', () => { renderProjects(); $('projectsDialog').showModal(); });
  if (mode.view === 'scale') {
    main.textContent = 'Play scale'; main.addEventListener('click', playScale);
    right.textContent = 'Save scale'; right.addEventListener('click', saveScale);
    $('playScale').hidden = true; $('saveScale').hidden = true;      // the same two actions, already in the bar
  } else {
    main.addEventListener('click', togglePlay);
    if (mode.task?.completeOn === 'export') { right.textContent = 'Export'; right.addEventListener('click', exportProject); $('exportFile').hidden = true; }
    else { right.textContent = 'Save'; right.addEventListener('click', () => saveProject()); $('saveProject').hidden = true; }
  }
  if (mode.view === 'roll') { $('laneField').hidden = true; $('importFile').hidden = true; }   // an exercise fixes its lane and its project
}

document.addEventListener('keydown', event => {
  if (event.code !== 'Space' || event.target.closest('input, select, button, dialog, a')) return;
  event.preventDefault();
  if (mode.view === 'scale') playScale(); else togglePlay();
});
window.addEventListener('lesson-audio-stop', () => { transport.stop(); renderPlay(); });
window.addEventListener('pagehide', () => { transport.stop(); audio.stopAll(); });

// ----- theme toggle ------------------------------------------------------------------------
(() => {
  const button = document.querySelector('.themeToggle');
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  const isDark = () => { const set = document.documentElement.dataset.theme; return set ? set === 'dark' : media.matches; };
  const sync = () => {
    const dark = isDark(), label = dark ? 'Switch to light theme' : 'Switch to dark theme';
    button.classList.toggle('isDark', dark);
    button.setAttribute('aria-pressed', String(dark));
    button.setAttribute('aria-label', label);
    button.title = label;
  };
  button.addEventListener('click', () => {
    const next = isDark() ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem('theme', next); } catch (e) { /* storage blocked */ }
    sync();
  });
  media.addEventListener('change', sync);
  sync();
})();
// Embedded in another page, follow its theme.
window.addEventListener('message', event => {
  if (event.source !== window.parent || event.origin !== window.location.origin) return;
  const message = event.data || {};
  if (message.type === 'lesson-theme' && (message.theme === 'light' || message.theme === 'dark')) document.documentElement.dataset.theme = message.theme;
});

setUpFrame();
render();
renderPlay();
if (mode.problem) sayMain(mode.problem, true);
else if (ui.opening) sayMain(ui.opening);
