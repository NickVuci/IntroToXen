import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadXenAudio, settle } from './helpers.mjs';
import * as P from '../shared/xen/project.js';
import { createTransport, windowNotes, expandProject, droneState } from '../shared/xen/transport.js';
import { createXenAudioAdapter, renderEvents } from '../shared/xen/audio-adapter.js';

function chordAndMelody({ loop = true } = {}) {
  let p = P.createProject({ id: 'p1', bars: 2, tempo: 90, tuning: { referenceHz: 220, scale: ['1/1', '9/8', '5/4', '3/2', '7/4'] } });
  const chords = P.trackOf(p, 'chords').id, melody = P.trackOf(p, 'melody').id;
  for (const degree of [0, 2, 3]) p = P.addNote(p, { trackId: chords, pitch: { degree, equaveOffset: 0 }, startTick: 0, durationTick: 3840 });
  [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0], [0, 1]].forEach(([degree, equaveOffset], i) => {
    p = P.addNote(p, { trackId: melody, pitch: { degree, equaveOffset }, startTick: i * 960, durationTick: 960 });
  });
  return { ...p, loop };
}

function fakeAudio() {
  const log = { notes: [], drones: [], cancels: 0 };
  let time = 10;
  return { log, advance: s => { time += s; }, now: () => time, schedule: note => log.notes.push(note), cancel: () => { log.cancels += 1; }, drone: state => log.drones.push(state) };
}
const manualTimer = () => { let fn = null; return { set: f => { fn = f; return 1; }, clear: () => { fn = null; }, tick: () => fn?.(), get running() { return fn !== null; } }; };

test('frequencies come from the tuning at playback time', () => {
  const p = chordAndMelody();
  assert.deepEqual(expandProject(p).filter(n => n.kind === 'chords').map(n => n.hz), [220, 275, 330]);
  assert.deepEqual(expandProject(p).filter(n => n.kind === 'melody').map(n => n.hz), [220, 247.5, 275, 330, 385, 440]);
  assert.deepEqual(expandProject(P.setReferenceHz(p, 200)).filter(n => n.kind === 'chords').map(n => n.hz), [200, 250, 300]);
  assert.deepEqual(droneState(p), { on: true, hz: 110, voice: 'bright', level: 0.6 });
  assert.deepEqual(droneState(P.setDrone(p, { on: false })), { on: false });
});

test('windows cover every note exactly once across loop passes', () => {
  const p = chordAndMelody(), length = p.lengthTick;
  const stepped = [];
  for (let from = 0; from < 3 * length; from += 700) stepped.push(...windowNotes(p, from, Math.min(from + 700, 3 * length)));
  assert.equal(stepped.length, 3 * p.notes.length);
  assert.equal(new Set(stepped.map(n => `${n.id}@${n.tick}`)).size, stepped.length);
  assert.equal(windowNotes({ ...p, loop: false }, 0, 3 * length).length, p.notes.length);
});

test('the transport schedules ahead, loops without drift and stops cleanly', () => {
  const p = chordAndMelody(), audio = fakeAudio(), timer = manualTimer();
  const transport = createTransport({ getProject: () => p, audio, timer });
  transport.play();
  assert.equal(audio.log.notes.filter(n => n.when === 10.06).length, 4, 'chord and first melody note start together');
  for (let i = 0; i < 400; i += 1) { audio.advance(0.05); timer.tick(); }      // 20 seconds
  const loopSeconds = P.ticksToSeconds(p, p.lengthTick);                       // 5.3333…
  const firstNotes = audio.log.notes.filter(n => n.hz === 247.5).map(n => n.when);
  assert.equal(firstNotes.length, 4);
  firstNotes.forEach((when, pass) => assert.ok(Math.abs(when - (10.06 + 960 * 60 / (90 * 960) + pass * loopSeconds)) < 1e-9));
  assert.ok(audio.log.notes.every(n => n.when >= 10.06 - 1e-9));
  transport.stop();
  assert.equal(timer.running, false);
  assert.equal(audio.log.cancels, 1);
  assert.deepEqual(audio.log.drones.at(-1), { on: false });
});

test('a project that does not loop stops at its end', () => {
  const p = chordAndMelody({ loop: false }), audio = fakeAudio(), timer = manualTimer();
  const transport = createTransport({ getProject: () => p, audio, timer });
  transport.play();
  for (let i = 0; i < 200 && transport.playing; i += 1) { audio.advance(0.05); timer.tick(); }
  assert.equal(transport.playing, false);
  assert.equal(audio.log.notes.length, p.notes.length);
});

test('edits made while playing are heard on the next pass', () => {
  let p = chordAndMelody();
  const audio = fakeAudio(), timer = manualTimer();
  const transport = createTransport({ getProject: () => p, audio, timer });
  transport.play();
  p = P.addNote(p, { trackId: P.trackOf(p, 'melody').id, pitch: { interval: '11/8' }, startTick: 7 * 960, durationTick: 480 });
  for (let i = 0; i < 120; i += 1) { audio.advance(0.05); timer.tick(); }
  assert.equal(audio.log.notes.filter(n => n.hz === 302.5).length, 1);
});

test('a tempo change never moves, skips or repeats a note', () => {
  // Eighth notes on 1/1 at 240 BPM, slowed to 30 BPM a tenth of a second in.
  let p = P.createProject({ id: 'p1', bars: 1, tempo: 240, tuning: { referenceHz: 220, scale: ['1/1'] } });
  const melody = P.trackOf(p, 'melody').id;
  for (let i = 0; i < 8; i += 1) p = P.addNote(p, { trackId: melody, pitch: { degree: 0, equaveOffset: 0 }, startTick: i * 480, durationTick: 240 });
  p = { ...p, loop: false };
  const audio = fakeAudio(), timer = manualTimer();
  const transport = createTransport({ getProject: () => p, audio, timer });
  transport.play();                                    // audio clock starts at 10; first note at 10.06
  const queuedEarly = audio.log.notes.map(n => n.when);
  assert.deepEqual(queuedEarly.map(t => Number((t - 10).toFixed(4))), [0.06, 0.185], 'two notes are queued inside the first lookahead');
  audio.advance(0.1); p = P.setTempo(p, 30); timer.tick();
  for (let i = 0; i < 400 && transport.playing; i += 1) { audio.advance(0.05); timer.tick(); }
  const times = audio.log.notes.map(n => n.when - 10);
  assert.equal(times.length, 8, 'every note is scheduled exactly once');
  assert.deepEqual(times.slice(0, 2).map(t => Number(t.toFixed(4))), [0.06, 0.185], 'queued notes keep their times');
  // The first lookahead reached tick 730 at 240 BPM (0.06 + 730/3840 s); 30 BPM runs from there.
  const boundary = 0.06 + 730 / 3840;
  times.slice(2).forEach((t, i) => assert.ok(Math.abs(t - (boundary + ((i + 2) * 480 - 730) / 480)) < 1e-9, `note ${i + 2} at ${t}`));
  for (let i = 1; i < times.length; i += 1) assert.ok(times[i] > times[i - 1], 'times only move forward');
  assert.ok(Math.abs((times[3] - times[2]) - 1) < 1e-9, 'after the change, eighth notes are one second apart');
});

test('two quick tempo changes keep the playhead and the notes continuous', () => {
  let p = chordAndMelody();
  const audio = fakeAudio(), timer = manualTimer(), seen = [];
  const transport = createTransport({ getProject: () => p, audio, timer, onState: s => seen.push(s.tick + s.pass * p.lengthTick) });
  transport.play();
  audio.advance(0.05); p = P.setTempo(p, 200); timer.tick();
  audio.advance(0.05); p = P.setTempo(p, 45); timer.tick();
  for (let i = 0; i < 300; i += 1) { audio.advance(0.05); timer.tick(); }
  for (let i = 1; i < seen.length; i += 1) assert.ok(seen[i] >= seen[i - 1] - 1e-6, `playhead went backwards at pump ${i}`);
  const melodyStarts = audio.log.notes.filter(n => n.kind === 'melody').map(n => n.when);
  for (let i = 1; i < melodyStarts.length; i += 1) assert.ok(melodyStarts[i] > melodyStarts[i - 1]);
  const perPass = p.notes.length, passes = Math.floor(audio.log.notes.length / perPass);
  assert.ok(passes >= 1);
  assert.equal(new Set(audio.log.notes.slice(0, passes * perPass).map(n => n.when + '|' + n.hz + '|' + n.kind)).size, passes * perPass, 'no note is scheduled twice');
});

test('a JI chord and ratio melody over a drone reach the real synth with exact frequencies', async () => {
  const { XenAudio, clock, mains } = loadXenAudio();
  const adapter = createXenAudioAdapter(XenAudio), timer = manualTimer();
  const p = { ...chordAndMelody(), loop: false };
  await adapter.resume();
  const transport = createTransport({ getProject: () => p, audio: adapter, timer });
  transport.play();
  for (let i = 0; i < 120; i += 1) { clock.time += 0.05; timer.tick(); await settle(); }
  const voices = mains();
  const drone = voices.filter(v => v.hz === 110);
  assert.equal(drone.length, 1, 'one drone, an octave below 1/1');
  const notes = voices.filter(v => v.hz !== 110).map(v => [v.hz, Number(v.startAt.toFixed(6))]).sort((a, b) => a[1] - b[1] || a[0] - b[0]);
  const beat = 60 / 90;
  assert.deepEqual(notes, [
    [220, 0.06], [220, 0.06], [275, 0.06], [330, 0.06],
    [247.5, Number((0.06 + beat).toFixed(6))], [275, Number((0.06 + 2 * beat).toFixed(6))], [330, Number((0.06 + 3 * beat).toFixed(6))],
    [385, Number((0.06 + 4 * beat).toFixed(6))], [440, Number((0.06 + 5 * beat).toFixed(6))],
  ]);
});

test('WAV render events include the drone and every note', () => {
  const events = renderEvents(chordAndMelody());
  assert.equal(events.length, 10);
  assert.deepEqual(events[0], { frequency: 110, startBeat: 0, durationBeats: 8, gain: 0.07 * 0.6, voice: 'drone' });
  assert.deepEqual(events.slice(1).map(e => e.frequency).sort((a, b) => a - b), [220, 220, 247.5, 275, 275, 330, 330, 385, 440]);
});
