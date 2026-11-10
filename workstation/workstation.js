// The workstation page. Everything musical goes through shared/xen/*; this file is interface only.
import * as T from '../shared/xen/tuning.js';
import * as P from '../shared/xen/project.js';
import { createStore, exportText, importText, fileName } from '../shared/xen/store.js';
import { take as takeHandoff, projectFromHandoff } from '../shared/xen/handoff.js';
import { createTransport } from '../shared/xen/transport.js';
import { createXenAudioAdapter, renderWav } from '../shared/xen/audio-adapter.js';

const STEP = P.PPQ / 2;                    // the grid is in eighth notes
const embedded = window.parent !== window;
const params = new URLSearchParams(window.location.search);
const lessonId = params.get('lesson') || '';
const $ = id => document.getElementById(id);
const el = (tag, className, text) => { const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; };
const nowIso = () => new Date().toISOString();
const count = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const show = text => (T.isExact(text) ? text : text.replace(/c$/, '¢'));

const store = createStore();
const audio = createXenAudioAdapter(window.XenAudio);
const lastKey = `nv:workstation:last${lessonId ? `:${lessonId}` : ''}`;
const remember = id => { try { localStorage.setItem(lastKey, id); } catch (e) { /* storage blocked */ } };
const recall = () => { try { return localStorage.getItem(lastKey); } catch (e) { return null; } };

// ----- state -----------------------------------------------------------------
const ui = { lane: 'melody', lengthTick: STEP, range: 1, savedRevision: -1, savedId: null, task: null, taskDone: false };
let history = P.createHistory(startingProject());
let rows = [];
const project = () => history.present;

function freshProject(extra = {}) {
  const now = nowIso();
  return P.createProject({ id: store.newId(Date.now().toString(36)), name: 'Untitled', now, origin: lessonId ? { lessonId } : undefined, ...extra });
}

function startingProject() {
  const handoff = takeHandoff();
  if (handoff) return projectFromHandoff(handoff, { id: store.newId(Date.now().toString(36)), now: nowIso() });
  for (const id of [params.get('project'), recall()]) {
    if (!id) continue;
    try { const saved = store.load(id); if (saved) { ui.savedRevision = saved.revision; ui.savedId = saved.id; return saved; } } catch (e) { /* unreadable: start fresh */ }
  }
  return freshProject();
}

function apply(change, message) {
  try {
    history.push(change(project()));
    render();
    if (message !== undefined) say(message);
    return true;
  } catch (error) {
    say(error.message, true);
    return false;
  }
}

// ----- messages ----------------------------------------------------------------
function say(text, alert = false, target = $('status')) {
  target.textContent = text;
  target.classList.toggle('alert', alert);
}

// ----- transport -----------------------------------------------------------------
const transport = createTransport({ getProject: project, audio, onState: () => {} });
const playhead = el('div', 'playhead');

async function togglePlay() {
  if (transport.playing) { transport.stop(); renderPlay(); return; }
  if (!audio.available()) { say('This browser cannot play audio.', true); return; }
  if (!(await audio.resume())) { say('Audio is paused while this section is not in view.', true); return; }
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

function renderPlay() {
  const button = $('play');
  button.textContent = transport.playing ? 'Stop' : 'Play';
  button.classList.toggle('playing', transport.playing);
}

// ----- rows ------------------------------------------------------------------------
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

// ----- rendering -------------------------------------------------------------------
function render() {
  const p = project();
  renderStanding(p);
  renderScale(p);
  renderControls(p);
  renderGrid(p);
  renderTask(p);
}

function renderStanding(p) {
  if (document.activeElement !== $('projectName')) $('projectName').value = p.name;
  const saved = ui.savedId === p.id && ui.savedRevision === p.revision;
  $('saveState').textContent = saved ? 'Saved' : 'Not saved';
  $('undo').disabled = !history.canUndo;
  $('redo').disabled = !history.canRedo;
}

function renderScale(p) {
  const chips = $('scaleChips');
  chips.replaceChildren();
  p.tuning.scale.forEach((text, degree) => {
    const chip = el('span', `chip${degree === 0 ? ' root' : ''}`);
    chip.append(el('strong', '', show(text)));
    if (T.isExact(text)) chip.append(el('small', '', T.formatCents(T.intervalCents(text))));
    else { const near = T.nearestJi(T.intervalCents(text)); chip.append(el('small', '', `≈ ${near.text} (${near.errorCents >= 0 ? '+' : '−'}${Math.abs(near.errorCents).toFixed(2)}¢)`)); }
    if (degree > 0) {
      const remove = el('button', '', '×');
      remove.type = 'button';
      remove.setAttribute('aria-label', `Remove ${show(text)} from the scale`);
      remove.addEventListener('click', () => apply(q => P.setScale(q, q.tuning.scale.filter(item => item !== text), nowIso()), `Removed ${show(text)}. Notes on it keep their pitch.`));
      chip.append(remove);
    }
    chips.append(chip);
  });
  const summary = P.summarize(p);
  $('scaleMeta').textContent = `${count(p.tuning.scale.length, 'note')} · ${summary.oddLimit}-odd-limit`;
  if (document.activeElement !== $('referenceHz')) $('referenceHz').value = p.tuning.referenceHz;
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
  $('gridMeta').textContent = `${count(p.notes.length, 'note')} · ${p.tempo} BPM`;
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
    const bars = el('div', 'bars');
    bars.id = 'noteLayer';
    bars.append(playhead);
    inner.append(bars);
  }
  const lane = P.trackOf(p, ui.lane).id;
  const cells = inner.querySelectorAll('.cell');
  cells.forEach(cell => {
    const row = rows[Number(cell.dataset.row)], column = Number(cell.dataset.column);
    const on = Boolean(P.noteAt(p, lane, row.pitch, column * STEP));
    cell.setAttribute('aria-pressed', String(on));
    cell.setAttribute('aria-label', `${show(row.interval)}, bar ${Math.floor(column / stepsPerBar) + 1}, step ${(column % stepsPerBar) + 1}`);
  });
  const bars = $('noteLayer');
  bars.querySelectorAll('.noteBar').forEach(node => node.remove());
  for (const note of p.notes) {
    const rowIndex = rows.findIndex(row => P.samePitch(row.pitch, note.pitch));
    const bar = el('div', `noteBar ${note.trackId === lane ? 'active' : 'other'}`);
    bar.style.top = `calc(${rowIndex} * var(--cell-h))`;
    bar.style.left = `calc(${note.startTick / STEP} * var(--cell-w) + 2px)`;
    bar.style.width = `calc(${Math.min(note.durationTick, p.lengthTick - note.startTick) / STEP} * var(--cell-w) - 4px)`;
    bars.append(bar);
  }
}

function renderTask(p) {
  const box = $('task');
  box.hidden = !ui.task;
  if (!ui.task) return;
  $('taskTitle').textContent = ui.task.title;
  $('taskBody').textContent = ui.task.body;
  const state = $('taskState');
  state.replaceChildren();
  if (ui.taskDone) { state.append(el('span', 'verdict', 'Complete.')); return; }
  const check = P.checkTask(p, ui.task.criteria);
  state.textContent = check.done ? 'Ready. Press Save to finish this exercise.' : check.missing[0];
}

// ----- actions ---------------------------------------------------------------------
function save() {
  const stamped = { ...project(), updatedAt: nowIso() };
  if (!store.save(stamped)) { say('The browser would not store the project. Use Export file to keep a copy.', true); return; }
  history.reset(stamped);          // saving is a clean point; undo starts again from here
  ui.savedRevision = stamped.revision; ui.savedId = stamped.id;
  remember(stamped.id);
  let message = 'Saved.';
  if (ui.task) {
    const check = P.checkTask(stamped, ui.task.criteria);
    if (check.done) {
      ui.taskDone = true;
      window.parent.postMessage({ type: 'lesson-lab-goal', goal: ui.task.taskId, lessonId: ui.task.lessonId, projectId: stamped.id, summary: P.summarize(stamped) }, window.location.origin);
    } else {
      message = `Saved. The exercise still needs something: ${check.missing[0]}`;
    }
  }
  render();
  say(message);
}

function open(next, message) {
  transport.stop();
  history = P.createHistory(next);
  gridKey = '';
  render();
  renderPlay();
  say(message);
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
      try { const loaded = store.load(item.id); ui.savedRevision = loaded.revision; ui.savedId = loaded.id; remember(loaded.id); $('projectsDialog').close(); open(loaded, `Opened ${loaded.name}.`); }
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

// ----- wiring ------------------------------------------------------------------------
$('rollInner').addEventListener('click', event => {
  const cell = event.target.closest('.cell');
  if (!cell) return;
  const row = rows[Number(cell.dataset.row)], startTick = Number(cell.dataset.column) * STEP;
  const trackId = P.trackOf(project(), ui.lane).id;
  const adding = !P.noteAt(project(), trackId, row.pitch, startTick);
  if (apply(p => P.toggleNote(p, { trackId, pitch: row.pitch, startTick, durationTick: ui.lengthTick }, nowIso()), '') && adding && !transport.playing) {
    audio.resume().then(ok => { if (ok) audio.audition(T.pitchHz(project().tuning, row.pitch), P.trackOf(project(), ui.lane).voice === 'pad' ? 'soft' : 'pluck'); });
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
$('referenceHz').addEventListener('change', () => {
  const hz = Number($('referenceHz').value);
  if (!(hz >= 20 && hz <= 2000)) { say('1/1 must be between 20 and 2000 Hz.', true, $('scaleStatus')); render(); return; }
  apply(p => P.setReferenceHz(p, hz, nowIso()));
  say(`1/1 is ${hz} Hz.`, false, $('scaleStatus'));
});

$('addIntervalForm').addEventListener('submit', event => {
  event.preventDefault();
  const input = $('intervalInput'), status = $('scaleStatus');
  try {
    const { text, exact } = T.parseInterval(input.value);
    if (project().tuning.scale.includes(text)) { say(`${show(text)} is already in the scale.`, false, status); return; }
    history.push(P.setScale(project(), [...project().tuning.scale, text], nowIso()));
    input.value = '';
    render();
    const limit = exact ? T.classify(text) : null;
    say(exact ? `Added ${text} · ${T.formatCents(T.intervalCents(text))} · ${limit.oddLimit}-odd-limit.` : `Added ${show(text)}, an approximate interval.`, false, status);
  } catch (error) {
    say(error.message, true, status);
  }
});

$('undo').addEventListener('click', () => { history.undo(); gridKey = ''; render(); say('Undone.'); });
$('redo').addEventListener('click', () => { history.redo(); gridKey = ''; render(); say('Redone.'); });
$('clearLane').addEventListener('click', () => apply(p => P.clearTrack(p, P.trackOf(p, ui.lane).id, nowIso()), `Cleared the ${ui.lane} lane. Undo brings it back.`));
$('play').addEventListener('click', togglePlay);
$('save').addEventListener('click', save);
$('projects').addEventListener('click', () => { renderProjects(); $('projectsDialog').showModal(); });
$('closeProjects').addEventListener('click', () => $('projectsDialog').close());
$('newProject').addEventListener('click', () => { $('projectsDialog').close(); ui.savedId = null; open(freshProject(), 'New project.'); });

$('exportFile').addEventListener('click', () => {
  const url = URL.createObjectURL(new Blob([exportText(project())], { type: 'application/json' }));
  const link = el('a'); link.href = url; link.download = fileName(project());
  document.body.append(link); link.click(); link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  say('Exported.');
});
$('importFile').addEventListener('click', () => $('fileInput').click());
$('fileInput').addEventListener('change', async () => {
  const file = $('fileInput').files[0];
  $('fileInput').value = '';
  if (!file) return;
  try {
    const imported = importText(await file.text());
    // an imported project gets its own id so it never overwrites a saved one
    ui.savedId = null;
    open({ ...imported, id: store.newId(Date.now().toString(36)) }, `Imported ${imported.name}. Save to keep it here.`);
  } catch (error) { say(error.message, true); }
});
$('renderWav').addEventListener('click', async () => {
  say('Rendering…');
  const result = await renderWav(window.XenAudio, project(), fileName(project()).replace(/\.xenproj\.json$/, '.wav'));
  say(result ? 'Saved one pass of the loop as a WAV file.' : 'This browser cannot render audio files.', !result);
});

document.addEventListener('keydown', event => {
  if (event.code !== 'Space' || event.target.closest('input, select, button, dialog')) return;
  event.preventDefault();
  togglePlay();
});

// The lesson page silences sections that are not in view.
window.addEventListener('lesson-audio-stop', () => { transport.stop(); renderPlay(); });
window.addEventListener('pagehide', () => { transport.stop(); audio.stopAll(); });

// ----- theme toggle (standalone) ---------------------------------------------------
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

// ----- inside a lesson -----------------------------------------------------------------
window.addEventListener('message', event => {
  if (event.source !== window.parent || event.origin !== window.location.origin) return;
  const message = event.data || {};
  if (message.type === 'lesson-theme' && (message.theme === 'light' || message.theme === 'dark')) {
    document.documentElement.dataset.theme = message.theme;
  } else if (message.type === 'lesson-task' && message.taskId) {
    ui.task = { lessonId: message.lessonId, taskId: message.taskId, title: String(message.title || ''), body: String(message.body || ''), criteria: message.criteria || {} };
    ui.taskDone = Boolean(message.done);
    render();
    $('task').scrollIntoView({ block: 'start' });
  } else if (message.type === 'lesson-handoff') {
    const handoff = takeHandoff();
    if (handoff) { ui.savedId = null; open(projectFromHandoff(handoff, { id: store.newId(Date.now().toString(36)), now: nowIso() }), 'Brought in the scale and loops from the lab.'); }
  }
});

render();
renderPlay();
if (project().origin?.from && ui.savedId !== project().id) say('Brought in the scale and loops from the lab.');
if (embedded) window.parent.postMessage({ type: 'lesson-lab-ready', lab: 'workstation' }, window.location.origin);
