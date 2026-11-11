// Scales as things in their own right: the just-interval palette a scale is built from, presets,
// the saved-scale record ("xen-scale", version 1), step sizes for the diagram, and Scala export.
// Pure: no DOM, audio or storage.
import * as T from './tuning.js';

export const FORMAT = 'xen-scale';
export const VERSION = 1;

/**
 * The intervals between 1/1 and 2/1 within an odd limit, grouped by the odd limit at which each
 * first appears: [{ oddLimit: 3, intervals: [{ text: "4/3", cents }, …] }, …]
 */
export function palette(oddLimit = 15) {
  const groups = new Map();
  for (const item of T.jiIntervals(oddLimit)) {
    if (item.text === '1/1' || item.text === '2/1') continue;
    const limit = T.classify(item.text).oddLimit;
    if (!groups.has(limit)) groups.set(limit, []);
    groups.get(limit).push(item);
  }
  return [...groups.entries()].sort((a, b) => a[0] - b[0]).map(([limit, intervals]) => ({ oddLimit: limit, intervals }));
}

// Every preset lies inside the 15-odd-limit, so each note can be found on the palette.
export const PRESETS = Object.freeze([
  { id: 'ptolemy-intense-diatonic', name: "Ptolemy's intense diatonic", note: 'The justly tuned major scale: 4:5:6 triads on 1/1, 4/3 and 3/2.', scale: ['1/1', '9/8', '5/4', '4/3', '3/2', '5/3', '15/8'] },
  { id: 'just-natural-minor', name: 'Just natural minor', note: '10:12:15 triads on 1/1, 4/3 and 3/2.', scale: ['1/1', '9/8', '6/5', '4/3', '3/2', '8/5', '9/5'] },
  { id: 'harmonics-8-16', name: 'Harmonics 8 to 16', note: 'One octave of the harmonic series.', scale: ['1/1', '9/8', '5/4', '11/8', '3/2', '13/8', '7/4', '15/8'] },
  { id: 'subharmonics-16-8', name: 'Subharmonics 16 to 8', note: 'One octave of the subharmonic series.', scale: ['1/1', '16/15', '8/7', '16/13', '4/3', '16/11', '8/5', '16/9'] },
  { id: 'diamond-5', name: '5-odd-limit tonality diamond', note: 'Every interval of the 5-odd-limit.', scale: ['1/1', '6/5', '5/4', '4/3', '3/2', '8/5', '5/3'] },
  { id: 'diamond-7', name: '7-odd-limit tonality diamond', note: 'Every interval of the 7-odd-limit.', scale: ['1/1', '8/7', '7/6', '6/5', '5/4', '4/3', '7/5', '10/7', '3/2', '8/5', '5/3', '12/7', '7/4'] },
  { id: 'pentatonic-3', name: '3-limit pentatonic', note: 'Five notes from a chain of 3/2 fifths.', scale: ['1/1', '9/8', '4/3', '3/2', '16/9'] },
]);

/** A scale array with an interval added, or removed if it is already there. 1/1 always stays. */
export function toggleInterval(scale, text) {
  const interval = T.parseInterval(text).text;
  if (interval === '1/1') return [...scale];
  return scale.includes(interval) ? scale.filter(item => item !== interval) : [...scale, interval].sort(T.compare);
}

/**
 * The scale as marks along its equave, with the step from each note to the next:
 * [{ text, cents, position: 0…1, step: "9/8", stepCents }], the last step reaching the equave.
 */
export function layout(tuning) {
  const span = T.intervalCents(tuning.equave);
  return tuning.scale.map((text, index) => {
    const next = tuning.scale[index + 1] ?? tuning.equave;
    const cents = T.intervalCents(text), step = T.divide(next, text);
    return { text, cents, position: cents / span, step, stepCents: T.intervalCents(step) };
  });
}

export function describe(tuning) {
  const exact = tuning.scale.filter(T.isExact);
  return {
    size: tuning.scale.length,
    oddLimit: exact.reduce((max, text) => Math.max(max, T.classify(text).oddLimit), 1),
    primeLimit: exact.reduce((max, text) => Math.max(max, T.classify(text).primeLimit), 1),
    allExact: exact.length === tuning.scale.length,
  };
}

// ----- saved scales ------------------------------------------------------------------

export function createScale({ id, name, tuning, now = '' }) {
  if (!id) throw new Error('A scale needs an id.');
  const clean = T.normalizeTuning({ ...tuning, name: undefined });
  return validateScale({ format: FORMAT, version: VERSION, id: String(id), name: String(name ?? '').trim().slice(0, 80) || 'Untitled scale', updatedAt: now, tuning: clean });
}

export function validateScale(scale) {
  if (!scale || scale.format !== FORMAT) throw new Error('This is not a xen-scale file.');
  if (scale.version !== VERSION) throw new Error(`Unsupported scale version ${scale.version}.`);
  if (typeof scale.id !== 'string' || !scale.id) throw new Error('The scale has no id.');
  if (typeof scale.name !== 'string' || !scale.name) throw new Error('The scale has no name.');
  const tuning = T.normalizeTuning(scale.tuning);
  if (JSON.stringify(tuning.scale) !== JSON.stringify(scale.tuning.scale)) throw new Error('The scale is not in canonical form.');
  return scale;
}

// ----- Scala export ---------------------------------------------------------------------
// Layout follows Scale Workshop's exporters so the files open there and in Scala-compatible synths.

const safeName = name => name.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-') || 'scale';
export const sclFileName = scale => `${safeName(scale.name)}.scl`;
export const kbmFileName = scale => `${safeName(scale.name)}.kbm`;

// Scala reads a pitch with a full stop as cents and one without as a ratio.
function sclPitch(text) {
  if (T.isExact(text)) return text;
  const cents = T.intervalCents(text).toFixed(6);
  return cents.includes('.') ? cents : `${cents}.`;
}

/** Scala scale file: every note above 1/1, then the equave. */
export function toScl(scale) {
  const { tuning } = validateScale(scale);
  const pitches = [...tuning.scale.slice(1), tuning.equave];
  return [
    `! ${sclFileName(scale)}`,
    '!',
    scale.name.replace(/[\r\n]+/g, ' '),
    ` ${pitches.length}`,
    '!',
    ...pitches.map(text => ` ${sclPitch(text)}`),
    '',
  ].join('\n');
}

/** Scala keyboard mapping: one key per note, 1/1 on `middleNote` at the scale's reference frequency. */
export function toKbm(scale, { middleNote = 60 } = {}) {
  const { tuning } = validateScale(scale);
  const size = tuning.scale.length;
  return [
    `! ${kbmFileName(scale)}`,
    '!',
    '! Size of map. The pattern repeats every so many keys:',
    String(size),
    '! First MIDI note number to retune:',
    '0',
    '! Last MIDI note number to retune:',
    '127',
    '! Middle note where the first entry of the mapping is mapped to:',
    String(middleNote),
    '! Reference note for which frequency is given:',
    String(middleNote),
    '! Frequency to tune the above note to',
    String(tuning.referenceHz),
    '! Scale degree to consider as formal octave (determines difference in pitch',
    '! between adjacent mapping patterns):',
    String(size),
    '! Mapping.',
    '! The numbers represent scale degrees mapped to keys. The first entry is for',
    '! the given middle note, the next for subsequent higher keys.',
    ...tuning.scale.map((_, degree) => String(degree)),
    '',
  ].join('\n');
}
