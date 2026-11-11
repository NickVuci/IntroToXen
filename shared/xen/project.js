// Canonical project model for the playground ("xen-project", version 1).
// Pure: no DOM, audio, storage, clock or randomness. Every edit returns a new project.
//
// Notes store scale degrees (or exact interval text), never frequencies. Time is integer
// ticks, 960 per quarter note, so nothing accumulates float error.
import { normalizeTuning, parseInterval, pitchInterval, compare, classify, isExact } from './tuning.js';

export const FORMAT = 'xen-project';
export const VERSION = 1;
export const PPQ = 960;
export const TRACK_KINDS = ['drone', 'chords', 'melody'];
export const LIMITS = Object.freeze({ notes: 2000, bars: 16, tempoMin: 30, tempoMax: 240, nameMax: 80, equaveRange: 4 });
export const VOICES = Object.freeze({ drone: 'bright', chords: 'pad', melody: 'pluck' });

const clone = value => JSON.parse(JSON.stringify(value));
const isInt = value => Number.isSafeInteger(value);

export const barTicks = meter => (PPQ * 4 * meter.numerator) / meter.denominator;
export const ticksToSeconds = (project, ticks) => (ticks * 60) / (project.tempo * PPQ);
export const trackOf = (project, kind) => project.tracks.find(track => track.kind === kind);

function nextId(project, prefix) {
  let max = 0;
  for (const item of [...project.tracks, ...project.notes]) {
    const match = new RegExp(`^${prefix}(\\d+)$`).exec(item.id);
    if (match) max = Math.max(max, Number(match[1]));
  }
  return `${prefix}${max + 1}`;
}

export function createProject({ id, name = 'Untitled', tuning, tempo = 90, meter = { numerator: 4, denominator: 4 }, bars = 2, now = '', origin } = {}) {
  if (!id) throw new Error('A project needs an id.');
  const project = {
    format: FORMAT, version: VERSION, id: String(id), name: String(name).slice(0, LIMITS.nameMax),
    createdAt: now, updatedAt: now, revision: 0,
    tuning: normalizeTuning(tuning ?? { referenceHz: 220, equave: '2/1', scale: ['1/1', '9/8', '5/4', '4/3', '3/2', '5/3', '15/8'] }),
    tempo, meter: { numerator: meter.numerator, denominator: meter.denominator }, ppq: PPQ,
    lengthTick: bars * barTicks(meter),
    loop: true,
    tracks: [
      { id: 't1', name: 'Drone', kind: 'drone', voice: VOICES.drone, level: 0.6, mute: false, drone: { on: true, pitch: { degree: 0, equaveOffset: -1 } } },
      { id: 't2', name: 'Chords', kind: 'chords', voice: VOICES.chords, level: 0.7, mute: false },
      { id: 't3', name: 'Melody', kind: 'melody', voice: VOICES.melody, level: 1, mute: false },
    ],
    notes: [],
  };
  if (origin) project.origin = clone(origin);
  return validateProject(project);
}

function validatePitch(tuning, pitch, where) {
  if (!pitch || typeof pitch !== 'object') throw new Error(`${where}: missing pitch.`);
  if (pitch.interval !== undefined) { parseInterval(pitch.interval); return; }
  if (!isInt(pitch.degree) || pitch.degree < 0 || pitch.degree >= tuning.scale.length) throw new Error(`${where}: degree ${pitch.degree} is not in the scale.`);
  if (!isInt(pitch.equaveOffset) || Math.abs(pitch.equaveOffset) > LIMITS.equaveRange) throw new Error(`${where}: equave offset out of range.`);
}

/** Checks a project and returns it. Throws with a plain-language reason. */
export function validateProject(p) {
  if (!p || p.format !== FORMAT) throw new Error('This is not a xen-project file.');
  if (p.version !== VERSION) throw new Error(`Unsupported project version ${p.version}.`);
  if (typeof p.id !== 'string' || !p.id) throw new Error('The project has no id.');
  const tuning = normalizeTuning(p.tuning);
  if (JSON.stringify(tuning.scale) !== JSON.stringify(p.tuning.scale) || tuning.equave !== p.tuning.equave) throw new Error('The scale is not in canonical form.');
  if (!(p.tempo >= LIMITS.tempoMin && p.tempo <= LIMITS.tempoMax)) throw new Error('Tempo must be between 30 and 240 BPM.');
  if (p.ppq !== PPQ) throw new Error('Unsupported time resolution.');
  if (!isInt(p.meter?.numerator) || !isInt(p.meter?.denominator) || p.meter.numerator < 1 || ![1, 2, 4, 8, 16].includes(p.meter.denominator)) throw new Error('Unsupported meter.');
  if (!isInt(p.lengthTick) || p.lengthTick <= 0 || p.lengthTick > LIMITS.bars * barTicks(p.meter)) throw new Error('The project length is out of range.');
  if (!Array.isArray(p.tracks) || !Array.isArray(p.notes)) throw new Error('The project is missing tracks or notes.');
  if (p.notes.length > LIMITS.notes) throw new Error('The project has too many notes.');
  const ids = new Set();
  const unique = id => { if (typeof id !== 'string' || !id || ids.has(id)) throw new Error(`Duplicate or missing id "${id}".`); ids.add(id); };
  const tracks = new Map();
  for (const track of p.tracks) {
    unique(track.id);
    if (!TRACK_KINDS.includes(track.kind)) throw new Error(`Unknown track kind "${track.kind}".`);
    if (!(track.level >= 0 && track.level <= 1)) throw new Error('Track level must be from 0 to 1.');
    if (typeof track.voice !== 'string' || typeof track.mute !== 'boolean') throw new Error(`Track "${track.id}" is missing its voice or mute setting.`);
    if (track.kind === 'drone') {
      if (typeof track.drone?.on !== 'boolean') throw new Error('The drone track is missing its on/off setting.');
      validatePitch(tuning, track.drone.pitch, 'Drone');
    }
    tracks.set(track.id, track);
  }
  // The workstation writes to exactly one track of each kind, so a project must have all three.
  for (const kind of TRACK_KINDS) {
    const count = p.tracks.filter(track => track.kind === kind).length;
    if (count !== 1) throw new Error(`A project needs exactly one ${kind} track; this one has ${count}.`);
  }
  for (const note of p.notes) {
    unique(note.id);
    const track = tracks.get(note.trackId);
    if (!track || track.kind === 'drone') throw new Error(`Note ${note.id} is on a missing or drone track.`);
    if (!isInt(note.startTick) || note.startTick < 0 || note.startTick >= p.lengthTick) throw new Error(`Note ${note.id} starts outside the project.`);
    if (!isInt(note.durationTick) || note.durationTick <= 0) throw new Error(`Note ${note.id} has no length.`);
    if (!isInt(note.velocity) || note.velocity < 1 || note.velocity > 127) throw new Error(`Note ${note.id} has a velocity outside 1–127.`);
    validatePitch(tuning, note.pitch, `Note ${note.id}`);
  }
  return p;
}

/** Text for saving. Key order is fixed, so the same project always gives the same text. */
export const serializeProject = project => JSON.stringify(validateProject(project), null, 1);

/** Reads saved text or an object, upgrading older versions. */
export function parseProject(input) {
  let data;
  try { data = typeof input === 'string' ? JSON.parse(input) : clone(input); } catch { throw new Error('The file is not valid JSON.'); }
  return validateProject(migrate(data));
}

/** Upgrade path for older saved versions. Version 1 is the first, so there is nothing to do yet. */
export function migrate(data) { return data; }

function commit(project, change, now) {
  const next = clone(project);
  change(next);
  next.revision = project.revision + 1;
  if (now !== undefined) next.updatedAt = now;
  return validateProject(next);
}

export const samePitch = (a, b) => (a.interval !== undefined || b.interval !== undefined)
  ? a.interval === b.interval
  : a.degree === b.degree && a.equaveOffset === b.equaveOffset;

export const noteAt = (project, trackId, pitch, startTick) =>
  project.notes.find(note => note.trackId === trackId && note.startTick === startTick && samePitch(note.pitch, pitch));

export const addNote = (project, { trackId, pitch, startTick, durationTick, velocity = 96 }, now) => commit(project, p => {
  p.notes.push({ id: nextId(p, 'n'), trackId, startTick, durationTick, velocity, pitch: clone(pitch) });
  p.notes.sort((a, b) => a.startTick - b.startTick || (a.id < b.id ? -1 : 1));
}, now);

export const removeNote = (project, noteId, now) => commit(project, p => { p.notes = p.notes.filter(note => note.id !== noteId); }, now);

/** Adds a note, or removes the one already at that pitch and start. */
export function toggleNote(project, spec, now) {
  const existing = noteAt(project, spec.trackId, spec.pitch, spec.startTick);
  return existing ? removeNote(project, existing.id, now) : addNote(project, spec, now);
}

export const clearTrack = (project, trackId, now) => commit(project, p => { p.notes = p.notes.filter(note => note.trackId !== trackId); }, now);
export const setName = (project, name, now) => commit(project, p => { p.name = String(name).trim().slice(0, LIMITS.nameMax) || 'Untitled'; }, now);
export const setTempo = (project, tempo, now) => commit(project, p => { p.tempo = Math.round(Math.min(LIMITS.tempoMax, Math.max(LIMITS.tempoMin, tempo))); }, now);
export const setScaleName = (project, name, now) => commit(project, p => { const text = String(name).trim().slice(0, 80); if (text) p.tuning.name = text; else delete p.tuning.name; }, now);
export const setReferenceHz = (project, hz, now) => commit(project, p => { p.tuning.referenceHz = hz; }, now);
export const setDrone = (project, drone, now) => commit(project, p => { const track = trackOf(p, 'drone'); track.drone = { ...track.drone, ...clone(drone) }; }, now);
export const setTrack = (project, trackId, patch, now) => commit(project, p => { Object.assign(p.tracks.find(track => track.id === trackId), clone(patch)); }, now);

export const setBars = (project, bars, now) => commit(project, p => {
  p.lengthTick = Math.min(LIMITS.bars, Math.max(1, bars)) * barTicks(p.meter);
  p.notes = p.notes.filter(note => note.startTick < p.lengthTick);
}, now);

/**
 * Replaces the scale. Notes keep their *interval*, not their degree number: a note on 5/4 stays
 * on 5/4 wherever it now sits in the scale. Notes whose interval has left the scale are kept as
 * direct-interval notes, so no pitch is ever lost or silently changed.
 */
export const setScale = (project, scale, now) => commit(project, p => {
  const old = p.tuning;
  const next = normalizeTuning({ ...old, scale });
  const remap = pitch => {
    if (pitch.interval !== undefined) return pitch;
    const step = old.scale[pitch.degree];
    const degree = next.scale.indexOf(step);
    return degree >= 0 ? { degree, equaveOffset: pitch.equaveOffset } : { interval: pitchInterval(old, pitch) };
  };
  for (const note of p.notes) note.pitch = remap(note.pitch);
  const drone = trackOf(p, 'drone');
  if (drone) drone.drone.pitch = remap(drone.drone.pitch);
  p.tuning = next;
}, now);

// ----- reading a project -------------------------------------------------------

/** The largest group of notes sounding at once on a track, as sorted distinct intervals. */
export function largestChord(project, trackId) {
  const notes = project.notes.filter(note => note.trackId === trackId);
  let best = [];
  for (const anchor of notes) {
    const sounding = notes.filter(note => note.startTick <= anchor.startTick && note.startTick + note.durationTick > anchor.startTick);
    const intervals = [...new Set(sounding.map(note => pitchInterval(project.tuning, note.pitch)))].sort(compare);
    if (intervals.length > best.length) best = intervals;
  }
  return best;
}

export function summarize(project) {
  const chords = trackOf(project, 'chords'), melody = trackOf(project, 'melody');
  const used = [...new Set(project.notes.map(note => pitchInterval(project.tuning, note.pitch)))].sort(compare);
  const exactScale = project.tuning.scale.filter(isExact);
  return {
    scaleSize: project.tuning.scale.length,
    exactScaleSize: exactScale.length,
    oddLimit: exactScale.reduce((max, text) => Math.max(max, classify(text).oddLimit), 1),
    noteCount: project.notes.length,
    melodyNotes: melody ? project.notes.filter(note => note.trackId === melody.id).length : 0,
    melodyIntervals: melody ? new Set(project.notes.filter(note => note.trackId === melody.id).map(note => pitchInterval(project.tuning, note.pitch))).size : 0,
    chord: chords ? largestChord(project, chords.id) : [],
    intervals: used,
  };
}

/**
 * Whether a project meets a lesson task. `criteria` comes from the lesson file:
 * { minScale, minChord, minMelodyNotes, minMelodyIntervals } — all optional.
 * Returns { done, missing: [plain sentences] }.
 */
export function checkTask(project, criteria = {}) {
  const s = summarize(project), missing = [];
  if (criteria.minScale && s.exactScaleSize < criteria.minScale) missing.push(`The scale needs ${criteria.minScale} just intervals, counting 1/1. It has ${s.exactScaleSize}.`);
  if (criteria.minChord && s.chord.length < criteria.minChord) missing.push(`The Chords lane needs ${criteria.minChord} different notes sounding together. The fullest chord has ${s.chord.length}.`);
  if (criteria.minMelodyNotes && s.melodyNotes < criteria.minMelodyNotes) missing.push(`The melody needs ${criteria.minMelodyNotes} notes. It has ${s.melodyNotes}.`);
  if (criteria.minMelodyIntervals && s.melodyIntervals < criteria.minMelodyIntervals) missing.push(`The melody needs ${criteria.minMelodyIntervals} different pitches. It has ${s.melodyIntervals}.`);
  return { done: missing.length === 0, missing };
}

// ----- undo ----------------------------------------------------------------------

export function createHistory(initial, { max = 100 } = {}) {
  let past = [], present = initial, future = [];
  return {
    get present() { return present; },
    get canUndo() { return past.length > 0; },
    get canRedo() { return future.length > 0; },
    push(next) { if (next === present) return present; past.push(present); if (past.length > max) past.shift(); present = next; future = []; return present; },
    undo() { if (!past.length) return present; future.push(present); present = past.pop(); return present; },
    redo() { if (!future.length) return present; past.push(present); present = future.pop(); return present; },
    reset(next) { past = []; future = []; present = next; return present; },
  };
}
