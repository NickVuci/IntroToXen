import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as P from '../shared/xen/project.js';
import { pitchInterval, pitchHz } from '../shared/xen/tuning.js';

const make = (extra = {}) => P.createProject({ id: 'p1', name: 'Test', now: '2026-11-10T00:00:00Z', tuning: { referenceHz: 220, scale: ['1/1', '9/8', '5/4', '3/2', '7/4'] }, ...extra });
const melody = p => P.trackOf(p, 'melody').id, chords = p => P.trackOf(p, 'chords').id;

test('a new project is valid and has three tracks', () => {
  const p = make();
  assert.deepEqual(p.tracks.map(t => t.kind), ['drone', 'chords', 'melody']);
  assert.equal(p.lengthTick, 2 * 4 * 960);
  assert.equal(P.validateProject(p), p);
});

test('edits are immutable, bump the revision and keep ids unique', () => {
  const a = make();
  const b = P.addNote(a, { trackId: melody(a), pitch: { degree: 2, equaveOffset: 0 }, startTick: 0, durationTick: 480 });
  const c = P.addNote(b, { trackId: melody(a), pitch: { degree: 3, equaveOffset: 0 }, startTick: 480, durationTick: 480 });
  assert.equal(a.notes.length, 0);
  assert.equal(c.notes.length, 2);
  assert.equal(c.revision, 2);
  assert.notEqual(c.notes[0].id, c.notes[1].id);
  const d = P.toggleNote(c, { trackId: melody(a), pitch: { degree: 2, equaveOffset: 0 }, startTick: 0, durationTick: 480 });
  assert.equal(d.notes.length, 1);
  const e = P.addNote(d, { trackId: melody(a), pitch: { degree: 1, equaveOffset: 0 }, startTick: 0, durationTick: 480 });
  assert.equal(new Set(e.notes.map(n => n.id)).size, e.notes.length);
});

test('invalid notes are refused', () => {
  const p = make();
  const base = { trackId: melody(p), pitch: { degree: 0, equaveOffset: 0 }, startTick: 0, durationTick: 480 };
  assert.throws(() => P.addNote(p, { ...base, pitch: { degree: 9, equaveOffset: 0 } }));
  assert.throws(() => P.addNote(p, { ...base, startTick: 99999 }));
  assert.throws(() => P.addNote(p, { ...base, startTick: 0.5 }));
  assert.throws(() => P.addNote(p, { ...base, trackId: P.trackOf(p, 'drone').id }));
  assert.throws(() => P.addNote(p, { ...base, pitch: { interval: '1.5' } }));
});

test('ratios survive save and load exactly', () => {
  let p = make();
  const intervals = ['1/1', '9/8', '5/4', '3/2', '7/4'];
  intervals.forEach((_, degree) => { p = P.addNote(p, { trackId: melody(p), pitch: { degree, equaveOffset: 0 }, startTick: degree * 960, durationTick: 960 }); });
  p = P.addNote(p, { trackId: melody(p), pitch: { interval: '11/8' }, startTick: 5 * 960, durationTick: 960 });
  p = P.addNote(p, { trackId: melody(p), pitch: { degree: 0, equaveOffset: 1 }, startTick: 6 * 960, durationTick: 960 });
  const text = P.serializeProject(p);
  const back = P.parseProject(text);
  assert.deepEqual(back, p);
  assert.equal(P.serializeProject(back), text);
  assert.deepEqual(back.notes.map(n => pitchInterval(back.tuning, n.pitch)), [...intervals, '11/8', '2/1']);
  assert.deepEqual(back.notes.map(n => pitchHz(back.tuning, n.pitch)), [220, 247.5, 275, 330, 385, 302.5, 440]);
  assert.equal(/\d\.\d{6}/.test(text), false, 'no long floats in a saved JI project');
});

test('bad files are refused with a reason', () => {
  assert.throws(() => P.parseProject('{'), /not valid JSON/);
  assert.throws(() => P.parseProject('{"format":"other"}'), /not a xen-project/);
  const p = JSON.parse(P.serializeProject(make()));
  p.version = 2;
  assert.throws(() => P.parseProject(p), /Unsupported project version/);
});

test('changing the scale never changes or loses a pitch', () => {
  let p = make();
  p = P.addNote(p, { trackId: melody(p), pitch: { degree: 2, equaveOffset: 0 }, startTick: 0, durationTick: 480 });      // 5/4
  p = P.addNote(p, { trackId: melody(p), pitch: { degree: 4, equaveOffset: -1 }, startTick: 480, durationTick: 480 });   // 7/8
  p = P.addNote(p, { trackId: melody(p), pitch: { degree: 3, equaveOffset: 0 }, startTick: 960, durationTick: 480 });    // 3/2
  const before = p.notes.map(n => pitchInterval(p.tuning, n.pitch));
  const q = P.setScale(p, ['1/1', '6/5', '5/4', '3/2']);   // 9/8 and 7/4 leave, 6/5 arrives
  assert.deepEqual(q.notes.map(n => pitchInterval(q.tuning, n.pitch)), before);
  assert.deepEqual(q.notes.map(n => n.pitch), [{ degree: 2, equaveOffset: 0 }, { interval: '7/8' }, { degree: 3, equaveOffset: 0 }]);
});

test('shortening the project drops notes past the end', () => {
  let p = make();
  p = P.addNote(p, { trackId: melody(p), pitch: { degree: 0, equaveOffset: 0 }, startTick: 5 * 960, durationTick: 480 });
  assert.equal(P.setBars(p, 1).notes.length, 0);
  assert.equal(P.setBars(p, 4).notes.length, 1);
});

test('summary and lesson tasks', () => {
  let p = make();
  assert.equal(P.checkTask(p, { minScale: 5 }).done, true);
  assert.equal(P.checkTask(p, { minScale: 6 }).done, false);
  assert.equal(P.checkTask(p, { minChord: 3 }).done, false);
  for (const degree of [0, 2, 3]) p = P.addNote(p, { trackId: chords(p), pitch: { degree, equaveOffset: 0 }, startTick: 0, durationTick: 3840 });
  assert.deepEqual(P.summarize(p).chord, ['1/1', '5/4', '3/2']);
  assert.equal(P.checkTask(p, { minChord: 3 }).done, true);
  assert.equal(P.checkTask(p, { minMelodyNotes: 4, minMelodyIntervals: 3 }).missing.length, 2);
  [0, 1, 2, 1].forEach((degree, i) => { p = P.addNote(p, { trackId: melody(p), pitch: { degree, equaveOffset: 0 }, startTick: i * 480, durationTick: 480 }); });
  assert.equal(P.checkTask(p, { minMelodyNotes: 4, minMelodyIntervals: 3 }).done, true);
  assert.equal(P.summarize(p).oddLimit, 9);
});

test('undo and redo', () => {
  const a = make(), h = P.createHistory(a);
  const b = h.push(P.setTempo(a, 120));
  h.push(P.setName(b, 'Renamed'));
  assert.equal(h.undo().name, 'Test');
  assert.equal(h.undo().tempo, 90);
  assert.equal(h.canUndo, false);
  assert.equal(h.redo().tempo, 120);
  h.push(P.setTempo(h.present, 60));
  assert.equal(h.canRedo, false);
});
