import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../shared/xen/tuning.js';

const near = (a, b, tol = 0.0001) => assert.ok(Math.abs(a - b) <= tol, `${a} is not within ${tol} of ${b}`);

test('ratios are canonical and exact', () => {
  assert.deepEqual(T.parseInterval('10/8'), { text: '5/4', exact: true });
  assert.deepEqual(T.parseInterval(' 2 '), { text: '2/1', exact: true });
  assert.deepEqual(T.parseInterval('702.30c'), { text: '702.3c', exact: false });
  for (const bad of ['', '5/0', '0/4', '1.25', 'abc', '5/4/3', '-5/4']) assert.throws(() => T.parseInterval(bad));
});

test('cents match the xen-core reference table', () => {
  const table = { '3/2': 701.9550, '5/4': 386.3137, '7/4': 968.8259, '11/8': 551.3179, '13/8': 840.5277, '81/80': 21.5063, '225/224': 7.7115 };
  for (const [ratio, cents] of Object.entries(table)) near(T.intervalCents(ratio), cents, 0.00005);
});

test('exact arithmetic never passes through floats', () => {
  assert.equal(T.multiply('5/4', '6/5'), '3/2');
  assert.equal(T.divide('3/2', '5/4'), '6/5');
  assert.equal(T.power('3/2', 12), '531441/4096');
  assert.equal(T.divide(T.power('3/2', 12), T.power('2/1', 7)), '531441/524288');
  assert.equal(T.power('81/80', 30).includes('/'), true);
  assert.equal(T.multiply('5/4', '100c'), '486.3137c');
  assert.equal(T.compare('5/4', '81/64'), -1);
  assert.equal(T.compare('386.3c', '5/4'), -1);
});

test('limits, monzos and subgroups', () => {
  assert.deepEqual(T.classify('7/6'), { oddLimit: 7, primeLimit: 7 });
  assert.deepEqual(T.classify('15/8'), { oddLimit: 15, primeLimit: 5 });
  assert.deepEqual(T.monzo('81/80'), { primes: [2, 3, 5], exponents: [-4, 4, -1] });
  assert.deepEqual(T.monzo('7/6', [2, 3, 7]), { primes: [2, 3, 7], exponents: [-1, -1, 1] });
  assert.equal(T.inSubgroup('7/6', [2, 3, 7]), true);
  assert.equal(T.inSubgroup('5/4', [2, 3, 7]), false);
  assert.throws(() => T.monzo('5/4', [2, 3, 7]));
  assert.throws(() => T.classify('386.3c'));
});

test('odd-limit counts match the reference table', () => {
  const counts = { 3: 2, 5: 6, 7: 12, 9: 18, 11: 28, 13: 40, 15: 48 };
  for (const [limit, count] of Object.entries(counts)) assert.equal(T.jiIntervals(Number(limit)).length, count + 2, `odd limit ${limit}`);
});

test('nearest ratio', () => {
  const hit = T.nearestJi(702);
  assert.equal(hit.text, '3/2');
  near(hit.errorCents, 0.045, 0.001);
  assert.equal(T.nearestJi(400, { oddLimit: 5 }).text, '5/4');
  assert.equal(T.nearestJi(0).text, '1/1');
  assert.equal(T.nearestJi(1200).text, '2/1');
});

test('tunings and pitches', () => {
  const tuning = T.normalizeTuning({ referenceHz: 220, scale: ['3/2', '5/4', '10/8', '7/4', '702.3c'] });
  assert.deepEqual(tuning.scale, ['1/1', '5/4', '3/2', '702.3c', '7/4']);
  assert.equal(tuning.equave, '2/1');
  assert.equal(T.pitchInterval(tuning, { degree: 2, equaveOffset: 1 }), '3/1');
  assert.equal(T.pitchInterval(tuning, { degree: 4, equaveOffset: -1 }), '7/8');
  assert.equal(T.pitchInterval(tuning, { interval: '11/8' }), '11/8');
  assert.equal(T.pitchHz(tuning, { degree: 1, equaveOffset: 0 }), 275);
  assert.equal(T.pitchHz(tuning, { degree: 2, equaveOffset: 0 }), 330);
  assert.deepEqual(T.pitchFromInterval(tuning, '2/1'), { degree: 0, equaveOffset: 1 });
  assert.deepEqual(T.pitchFromInterval(tuning, '7/8'), { degree: 4, equaveOffset: -1 });
  assert.deepEqual(T.pitchFromInterval(tuning, '11/8'), { interval: '11/8' });
  assert.throws(() => T.normalizeTuning({ referenceHz: 220, scale: ['9/4'] }));
  assert.throws(() => T.normalizeTuning({ referenceHz: 5, scale: [] }));
  const tritave = T.normalizeTuning({ referenceHz: 200, equave: '3/1', scale: ['9/7', '5/3', '7/3'] });
  assert.equal(T.pitchInterval(tritave, { degree: 1, equaveOffset: 1 }), '27/7');
});
