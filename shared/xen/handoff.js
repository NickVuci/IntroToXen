// Lab-to-workstation transfer ("xen-handoff", version 1).
// A lab describes what the learner made; the workstation turns it into a project.
// The carrier is one localStorage entry, taken (read and removed) by the workstation.
import { normalizeTuning, parseInterval, pitchFromInterval, compare } from './tuning.js';
import { createProject, addNote, trackOf, barTicks, PPQ, LIMITS } from './project.js';

export const FORMAT = 'xen-handoff';
export const VERSION = 1;
const KEY = 'nv:handoff:pending';
const browserStorage = () => { try { return globalThis.localStorage ?? null; } catch { return null; } };

export function validateHandoff(payload) {
  if (!payload || payload.format !== FORMAT || payload.version !== VERSION) throw new Error('Not a xen-handoff payload.');
  const tuning = normalizeTuning(payload.tuning);
  const material = Array.isArray(payload.material) ? payload.material : [];
  for (const item of material) {
    if (!['chord', 'melody'].includes(item.kind) || !Array.isArray(item.notes)) throw new Error('Handoff material must be chords or melodies with notes.');
    for (const note of item.notes) {
      if (!Number.isSafeInteger(note.startTick) || !Number.isSafeInteger(note.durationTick) || note.durationTick <= 0) throw new Error('Handoff notes need whole-tick times.');
      if (note.pitch?.interval !== undefined) parseInterval(note.pitch.interval);
      else if (!(note.pitch?.degree >= 0 && note.pitch.degree < tuning.scale.length)) throw new Error('A handoff note names a degree outside its scale.');
    }
  }
  return { ...payload, tuning, material };
}

export function send(payload, storage = browserStorage()) {
  const text = JSON.stringify(validateHandoff(payload));
  try { if (!storage) return false; storage.setItem(KEY, text); return true; } catch { return false; }
}

/** Reads and removes the pending handoff. Null when there is none or it is unusable. */
export function take(storage = browserStorage()) {
  try {
    const text = storage?.getItem(KEY);
    if (!text) return null;
    storage.removeItem(KEY);
    return validateHandoff(JSON.parse(text));
  } catch { return null; }
}

/**
 * The Just Intonation lab's state as a handoff.
 *   scaleNotes: [{ ratioLabel: "5/4" | "702.3c" }]   (the lab's scale includes 2/1)
 *   cells:      [{ id, type: "chord"|"melody"|null, events: [{ startBeat, durationBeats, scaleIndex }] }]
 * A locked note travels as its ratio; an unlocked one as cents, so the approximation stays visible.
 */
export function fromJiLab({ lessonId = 'just-intonation', rootHz, scaleNotes, cells = [], bpm = 90, beatsPerLoop = 16 }) {
  const equave = '2/1';
  const labels = scaleNotes.map(note => parseInterval(note.ratioLabel).text);
  const tuning = normalizeTuning({ referenceHz: rootHz, equave, scale: labels.filter(text => compare(text, equave) < 0) });
  const material = cells.filter(cell => cell.type && cell.events.length).map(cell => ({
    kind: cell.type,
    name: `Cell ${cell.id + 1}`,
    tempo: bpm,
    lengthTick: beatsPerLoop * PPQ,
    notes: cell.events.filter(event => labels[event.scaleIndex] !== undefined).map(event => ({
      pitch: pitchFromInterval(tuning, labels[event.scaleIndex]),
      startTick: Math.round(event.startBeat * PPQ),
      durationTick: Math.max(1, Math.round(event.durationBeats * PPQ)),
      velocity: cell.type === 'chord' ? 80 : 100,
    })),
  }));
  return validateHandoff({ format: FORMAT, version: VERSION, source: { kind: 'lab', id: 'just-intonation', lessonId }, tuning, material });
}

/**
 * A project from a handoff: the scale and reference, the first chord loop on the Chords lane and
 * the first melody loop on the Melody lane, both from the start. Further cells stay in the payload.
 */
export function projectFromHandoff(payload, { id, now = '', name } = {}) {
  const handoff = validateHandoff(payload);
  const used = ['chord', 'melody'].map(kind => handoff.material.find(item => item.kind === kind)).filter(Boolean);
  const meter = { numerator: 4, denominator: 4 };
  const longest = used.reduce((max, item) => Math.max(max, item.lengthTick ?? 0, ...item.notes.map(note => note.startTick + 1)), 0);
  const bars = Math.min(LIMITS.bars, Math.max(2, Math.ceil(longest / barTicks(meter))));
  let project = createProject({
    id, now, name: name ?? 'From the lab', tuning: handoff.tuning, tempo: used[0]?.tempo ?? 90, meter, bars,
    origin: handoff.source?.lessonId ? { lessonId: handoff.source.lessonId, from: handoff.source.id } : undefined,
  });
  for (const item of used) {
    const trackId = trackOf(project, item.kind === 'chord' ? 'chords' : 'melody').id;
    for (const note of item.notes) {
      if (note.startTick < project.lengthTick) project = addNote(project, { trackId, pitch: note.pitch, startTick: note.startTick, durationTick: note.durationTick, velocity: note.velocity ?? 96 }, now);
    }
  }
  return project;
}
