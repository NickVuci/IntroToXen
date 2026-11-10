import { test } from 'node:test';
import assert from 'node:assert/strict';
import { memoryStorage } from './helpers.mjs';
import { createStore, exportText, importText, fileName } from '../shared/xen/store.js';
import { createProgress } from '../shared/xen/progress.js';
import * as H from '../shared/xen/handoff.js';
import * as P from '../shared/xen/project.js';
import { pitchInterval } from '../shared/xen/tuning.js';

const project = (id, updatedAt) => P.createProject({ id, name: `Project ${id}`, now: updatedAt });

test('store saves, lists newest first, loads and removes', () => {
  const store = createStore(memoryStorage());
  assert.equal(store.save(project('a', '2026-11-10T10:00:00Z')), true);
  assert.equal(store.save(project('b', '2026-11-10T11:00:00Z')), true);
  assert.deepEqual(store.list().map(item => item.id), ['b', 'a']);
  assert.deepEqual(store.load('a'), project('a', '2026-11-10T10:00:00Z'));
  assert.equal(store.load('missing'), null);
  store.save(P.setName(project('a', '2026-11-10T10:00:00Z'), 'Renamed', '2026-11-10T12:00:00Z'));
  assert.deepEqual(store.list().map(item => item.name), ['Renamed', 'Project b']);
  store.remove('b');
  assert.deepEqual(store.list().map(item => item.id), ['a']);
  assert.equal(store.newId('a'), 'pa');
});

test('store works without storage and with full storage', () => {
  const none = createStore(null);
  assert.equal(none.available(), false);
  assert.equal(none.save(project('a', 'x')), false);
  assert.deepEqual(none.list(), []);
  const full = createStore({ getItem: () => null, setItem() { throw new Error('quota'); }, removeItem() {} });
  assert.equal(full.save(project('a', 'x')), false);
});

test('export and import round-trip', () => {
  const p = project('a', '2026-11-10T10:00:00Z');
  assert.deepEqual(importText(exportText(p)), p);
  assert.equal(fileName(P.setName(p, 'My 7/4 study')), 'My-74-study.xenproj.json');
  assert.throws(() => importText('nonsense'));
});

test('progress wraps the map key and records tasks', () => {
  const storage = memoryStorage();
  storage.setItem('intro-to-xen-map-progress', '["harmonic-series"]');
  const progress = createProgress(storage);
  assert.equal(progress.isComplete('harmonic-series'), true);
  progress.complete('just-intonation');
  progress.complete('just-intonation');
  assert.equal(storage.getItem('intro-to-xen-map-progress'), '["harmonic-series","just-intonation"]');
  progress.setTask('just-intonation', 'ji-scale', { done: true, projectId: 'p1' });
  assert.equal(progress.allDone('just-intonation', ['ji-scale', 'ji-chord']), false);
  progress.setTask('just-intonation', 'ji-chord', { done: true, projectId: 'p1' });
  assert.equal(progress.allDone('just-intonation', ['ji-scale', 'ji-chord']), true);
  assert.equal(progress.allDone('just-intonation', []), false);
  progress.uncomplete('just-intonation');
  assert.equal(progress.isComplete('just-intonation'), false);
  storage.setItem('intro-to-xen-map-progress', 'broken');
  assert.deepEqual(progress.completed(), []);
});

// The lab's own shapes: scale notes carry a label; cells index into the scale by position.
const labState = () => ({
  rootHz: 196,
  scaleNotes: [{ ratioLabel: '1/1' }, { ratioLabel: '5/4' }, { ratioLabel: '3/2' }, { ratioLabel: '702.3c' }, { ratioLabel: '7/4' }, { ratioLabel: '2/1' }],
  cells: [
    { id: 0, type: 'chord', events: [0, 4, 8, 12].flatMap(startBeat => [0, 1, 2].map(scaleIndex => ({ startBeat, durationBeats: 3.55, scaleIndex }))) },
    { id: 1, type: 'melody', events: [0, 4, 5, 3, 1, 2].map((scaleIndex, beat) => ({ startBeat: beat, durationBeats: 0.82, scaleIndex })) },
    { id: 2, type: null, events: [] },
    { id: 3, type: 'melody', events: [{ startBeat: 0, durationBeats: 1, scaleIndex: 0 }] },
  ],
});

test('the lab state becomes a handoff with exact intervals', () => {
  const handoff = H.fromJiLab(labState());
  assert.deepEqual(handoff.tuning, { referenceHz: 196, equave: '2/1', scale: ['1/1', '5/4', '3/2', '702.3c', '7/4'] });
  assert.deepEqual(handoff.material.map(item => item.kind), ['chord', 'melody', 'melody']);
  const melody = handoff.material[1].notes;
  assert.deepEqual(melody.map(note => pitchInterval(handoff.tuning, note.pitch)), ['1/1', '7/4', '2/1', '702.3c', '5/4', '3/2']);
  assert.deepEqual(melody[2].pitch, { degree: 0, equaveOffset: 1 });
  assert.deepEqual(melody.map(note => note.startTick), [0, 960, 1920, 2880, 3840, 4800]);
});

test('send and take carry a handoff once', () => {
  const storage = memoryStorage();
  assert.equal(H.send(H.fromJiLab(labState()), storage), true);
  const taken = H.take(storage);
  assert.equal(taken.tuning.scale[4], '7/4');
  assert.equal(H.take(storage), null);
  storage.setItem('nv:handoff:pending', '{"format":"wrong"}');
  assert.equal(H.take(storage), null);
  assert.throws(() => H.send({ format: 'xen-handoff', version: 1, tuning: { referenceHz: 220, scale: [] }, material: [{ kind: 'chord', notes: [{ pitch: { degree: 5 }, startTick: 0, durationTick: 1 }] }] }, storage));
});

test('a handoff becomes a valid project that keeps every ratio', () => {
  const p = H.projectFromHandoff(H.fromJiLab(labState()), { id: 'p1', now: '2026-11-10T10:00:00Z' });
  assert.equal(p.lengthTick, 16 * 960);
  assert.equal(p.tempo, 90);
  assert.deepEqual(p.origin, { lessonId: 'just-intonation', from: 'just-intonation' });
  const chords = P.trackOf(p, 'chords').id, melody = P.trackOf(p, 'melody').id;
  assert.equal(p.notes.filter(note => note.trackId === chords).length, 12);
  assert.equal(p.notes.filter(note => note.trackId === melody).length, 6);
  assert.deepEqual(P.summarize(p).chord, ['1/1', '5/4', '3/2']);
  assert.deepEqual(P.parseProject(P.serializeProject(p)), p);
});
