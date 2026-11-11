import { test } from 'node:test';
import assert from 'node:assert/strict';
import { memoryStorage } from './helpers.mjs';
import * as S from '../shared/xen/scale.js';
import * as T from '../shared/xen/tuning.js';
import * as P from '../shared/xen/project.js';
import { createStore } from '../shared/xen/store.js';

const ptolemy = () => S.createScale({ id: 's1', name: "Ptolemy's intense diatonic", now: '2026-11-10T00:00:00Z', tuning: { referenceHz: 220, scale: S.PRESETS[0].scale } });

test('the palette is the 15-odd-limit, grouped as in the reference table', () => {
  const groups = S.palette(15);
  assert.deepEqual(groups.map(g => [g.oddLimit, g.intervals.length]), [[3, 2], [5, 4], [7, 6], [9, 6], [11, 10], [13, 12], [15, 8]]);
  assert.deepEqual(groups[0].intervals.map(i => i.text), ['4/3', '3/2']);
  assert.deepEqual(groups[1].intervals.map(i => i.text), ['6/5', '5/4', '8/5', '5/3']);
  assert.deepEqual(groups[6].intervals.map(i => i.text), ['16/15', '15/14', '15/13', '15/11', '22/15', '26/15', '28/15', '15/8']);
  assert.equal(groups.flatMap(g => g.intervals).length, 48);
});

test('every preset is a valid scale inside the palette', () => {
  const inPalette = new Set(['1/1', ...S.palette(15).flatMap(g => g.intervals.map(i => i.text))]);
  for (const preset of S.PRESETS) {
    const tuning = T.normalizeTuning({ referenceHz: 220, scale: preset.scale });
    assert.deepEqual(tuning.scale, preset.scale, `${preset.name} is ascending and canonical`);
    assert.ok(preset.scale.every(text => inPalette.has(text)), `${preset.name} is inside the 15-odd-limit`);
  }
  assert.equal(new Set(S.PRESETS.map(p => p.id)).size, S.PRESETS.length);
});

test('preset structures are what their names say', () => {
  const steps = id => S.layout(T.normalizeTuning({ referenceHz: 220, scale: S.PRESETS.find(p => p.id === id).scale })).map(m => m.step);
  assert.deepEqual(steps('ptolemy-intense-diatonic'), ['9/8', '10/9', '16/15', '9/8', '10/9', '9/8', '16/15']);
  assert.deepEqual(steps('just-natural-minor'), ['9/8', '16/15', '10/9', '9/8', '16/15', '9/8', '10/9']);
  assert.deepEqual(steps('harmonics-8-16'), ['9/8', '10/9', '11/10', '12/11', '13/12', '14/13', '15/14', '16/15']);
  // the subharmonic octave is the harmonic one upside down
  const harmonic = S.PRESETS.find(p => p.id === 'harmonics-8-16').scale, sub = S.PRESETS.find(p => p.id === 'subharmonics-16-8').scale;
  assert.deepEqual(sub.slice(1), harmonic.slice(1).map(text => T.divide('2/1', text)).sort(T.compare));
  assert.deepEqual(S.PRESETS.find(p => p.id === 'diamond-5').scale.slice(1), T.jiIntervals(5).map(i => i.text).slice(1, -1));
  assert.deepEqual(S.PRESETS.find(p => p.id === 'diamond-7').scale.slice(1), T.jiIntervals(7).map(i => i.text).slice(1, -1));
  const major = S.PRESETS[0].scale;   // 4:5:6 on 1/1, 4/3 and 3/2
  for (const root of ['1/1', '4/3', '3/2']) for (const part of ['5/4', '3/2']) {
    const note = T.multiply(root, part);
    assert.ok(major.includes(T.compare(note, '2/1') >= 0 ? T.divide(note, '2/1') : note), `${root} × ${part}`);
  }
});

test('toggling intervals keeps the scale sorted and 1/1 in place', () => {
  let scale = ['1/1'];
  for (const text of ['3/2', '5/4', '7/4', '10/8']) scale = S.toggleInterval(scale, text);
  assert.deepEqual(scale, ['1/1', '3/2', '7/4']);
  assert.deepEqual(S.toggleInterval(scale, '1/1'), scale);
});

test('layout gives positions and exact steps', () => {
  const marks = S.layout(ptolemy().tuning);
  assert.equal(marks[0].position, 0);
  assert.ok(Math.abs(marks[4].position - 701.955 / 1200) < 1e-6);
  assert.equal(marks.reduce((product, mark) => T.multiply(product, mark.step), '1/1'), '2/1');
  assert.deepEqual(S.describe(ptolemy().tuning), { size: 7, oddLimit: 15, primeLimit: 5, allExact: true });
});

test('Scala scale file', () => {
  assert.equal(S.toScl(ptolemy()), [
    '! Ptolemys-intense-diatonic.scl', '!', "Ptolemy's intense diatonic", ' 7', '!',
    ' 9/8', ' 5/4', ' 4/3', ' 3/2', ' 5/3', ' 15/8', ' 2/1', '',
  ].join('\n'));
  const mixed = S.createScale({ id: 's2', name: 'Mixed', tuning: { referenceHz: 220, scale: ['650c', '3/2'] } });
  assert.deepEqual(S.toScl(mixed).split('\n').slice(5, 8), [' 650.000000', ' 3/2', ' 2/1']);
});

test('Scala keyboard mapping', () => {
  const lines = S.toKbm(ptolemy()).split('\n').filter(line => !line.startsWith('!'));
  assert.deepEqual(lines, ['7', '0', '127', '60', '60', '220', '7', '0', '1', '2', '3', '4', '5', '6', '']);
});

test('saved scales: save, list newest first, replace, load, remove', () => {
  const store = createStore(memoryStorage());
  assert.deepEqual(store.listScales(), []);
  store.saveScale(ptolemy());
  store.saveScale(S.createScale({ id: 's2', name: 'Second', tuning: { referenceHz: 200, scale: ['3/2'] } }));
  assert.deepEqual(store.listScales().map(s => s.id), ['s2', 's1']);
  store.saveScale({ ...ptolemy(), name: 'Renamed' });
  assert.deepEqual(store.listScales().map(s => s.name), ['Renamed', 'Second']);
  assert.equal(store.loadScale('s2').tuning.referenceHz, 200);
  assert.equal(store.loadScale('none'), null);
  store.removeScale('s1');
  assert.deepEqual(store.listScales().map(s => s.id), ['s2']);
  assert.throws(() => store.saveScale({ format: 'other' }));
});

test('a scale name travels with a project and survives scale edits', () => {
  let p = P.createProject({ id: 'p1', tuning: { ...ptolemy().tuning, name: 'My scale' } });
  assert.equal(p.tuning.name, 'My scale');
  p = P.setScale(p, S.toggleInterval(p.tuning.scale, '7/4'));
  assert.equal(p.tuning.name, 'My scale');
  assert.equal(P.parseProject(P.serializeProject(p)).tuning.name, 'My scale');
  assert.equal(P.setScaleName(p, '').tuning.name, undefined);
});

test('reopening a saved scale restores its reference and equave, and saving it again keeps them', () => {
  const store = createStore(memoryStorage());
  const saved = S.createScale({ id: 's440', name: 'A at 440', tuning: { referenceHz: 440, scale: ['1/1', '5/4', '3/2'] } });
  store.saveScale(saved);
  // the default workstation project is at 220 Hz; reopen the saved scale into it, as the page does
  let p = P.createProject({ id: 'p1', tuning: { referenceHz: 220, scale: ['1/1', '9/8', '5/4'] } });
  p = P.addNote(p, { trackId: P.trackOf(p, 'melody').id, pitch: { degree: 2, equaveOffset: 0 }, startTick: 0, durationTick: 480 });   // 5/4
  const loaded = store.loadScale('s440');
  p = P.setTuning(p, { ...loaded.tuning, name: loaded.name });
  assert.deepEqual(p.tuning, { referenceHz: 440, equave: '2/1', scale: ['1/1', '5/4', '3/2'], name: 'A at 440' });
  assert.deepEqual(p.notes[0].pitch, { degree: 1, equaveOffset: 0 });
  assert.equal(T.pitchHz(p.tuning, p.notes[0].pitch), 550);
  store.saveScale(S.createScale({ id: 's440', name: p.tuning.name, tuning: p.tuning }));
  assert.equal(store.loadScale('s440').tuning.referenceHz, 440);
});

test('a new equave keeps every note on its interval', () => {
  let p = P.createProject({ id: 'p1', tuning: { referenceHz: 220, scale: ['1/1', '5/4', '3/2', '7/4'] } });
  const melody = P.trackOf(p, 'melody').id;
  for (const [degree, equaveOffset] of [[1, 0], [2, 1], [3, 0], [0, 1]]) p = P.addNote(p, { trackId: melody, pitch: { degree, equaveOffset }, startTick: p.notes.length * 480, durationTick: 480 });
  const before = p.notes.map(n => T.pitchInterval(p.tuning, n.pitch));          // 5/4, 3/1, 7/4, 2/1
  const q = P.setTuning(p, { referenceHz: 220, equave: '3/1', scale: ['1/1', '5/4', '3/2', '7/4', '2/1'] });
  assert.deepEqual(q.notes.map(n => T.pitchInterval(q.tuning, n.pitch)), before);
  assert.deepEqual(q.notes.map(n => n.pitch), [{ degree: 1, equaveOffset: 0 }, { degree: 0, equaveOffset: 1 }, { degree: 3, equaveOffset: 0 }, { degree: 4, equaveOffset: 0 }]);
  assert.deepEqual(P.trackOf(q, 'drone').drone.pitch, { degree: 2, equaveOffset: -1 }, 'the drone, 1/2, is 3/2 one 3/1 equave down');
  assert.equal(T.pitchHz(q.tuning, P.trackOf(q, 'drone').drone.pitch), 110);
});
