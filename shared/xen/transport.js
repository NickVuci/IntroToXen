// Playback: turns a project into timed voices and feeds them to an audio adapter a little ahead
// of time. Same design as Temperament Lab's composition transport (integer ticks, a bounded
// lookahead pump, loop by counting whole passes), rewritten for the flat xen-project model.
//
// Audio seconds are always computed from an integer tick as anchor + ticks * 60 / (tempo * 960),
// so nothing drifts however long the loop runs.
//
// audio adapter: { now(), schedule({ hz, when, duration, velocity, voice, level }), cancel(), drone({ on, hz, voice, level }) }
import { pitchHz } from './tuning.js';
import { PPQ } from './project.js';

export const LOOKAHEAD_SECONDS = 0.25;
export const PUMP_MS = 50;
export const START_DELAY_SECONDS = 0.06;

/** Every sounding note of one pass, in start order, with its frequency resolved from the tuning. */
export function expandProject(project) {
  const tracks = new Map(project.tracks.map(track => [track.id, track]));
  return project.notes
    .filter(note => !tracks.get(note.trackId).mute)
    .map(note => {
      const track = tracks.get(note.trackId);
      return { id: note.id, startTick: note.startTick, durationTick: note.durationTick, velocity: note.velocity,
        hz: pitchHz(project.tuning, note.pitch), voice: track.voice, level: track.level, kind: track.kind };
    })
    .sort((a, b) => a.startTick - b.startTick || (a.id < b.id ? -1 : 1));
}

/** Notes whose (virtual, ever-increasing) start tick falls in [fromTick, toTick), across loop passes. */
export function windowNotes(project, fromTick, toTick) {
  const notes = expandProject(project), length = project.lengthTick, out = [];
  if (toTick <= fromTick) return out;
  const lastPass = project.loop ? Math.floor((toTick - 1) / length) : 0;
  for (let pass = Math.max(0, Math.floor(fromTick / length)); pass <= lastPass; pass += 1) {
    for (const note of notes) {
      const tick = pass * length + note.startTick;
      if (tick >= fromTick && tick < toTick) out.push({ ...note, tick });
    }
  }
  return out;
}

export function droneState(project) {
  const track = project.tracks.find(item => item.kind === 'drone');
  if (!track || track.mute || !track.drone?.on) return { on: false };
  return { on: true, hz: pitchHz(project.tuning, track.drone.pitch), voice: track.voice, level: track.level };
}

export function createTransport({
  getProject, audio, onState = () => {},
  timer = { set: (fn, ms) => setInterval(fn, ms), clear: id => clearInterval(id) },
  lookahead = LOOKAHEAD_SECONDS, pumpMs = PUMP_MS,
}) {
  let playing = false, handle = null;
  let anchorSeconds = 0;   // audio time of anchorTick
  let anchorTick = 0;      // virtual tick the anchor refers to
  let scheduledTo = 0;     // virtual tick up to which notes are already handed to the audio engine
  let tempo = 0;
  let previous = null;     // the mapping in force before the last tempo change, for times before the anchor

  const secondsPerTick = () => 60 / (tempo * PPQ);
  const secondsAt = tick => anchorSeconds + (tick - anchorTick) * secondsPerTick();
  const tickAt = seconds => (previous && seconds < anchorSeconds
    ? previous.anchorTick + (seconds - previous.anchorSeconds) * previous.tempo * PPQ / 60
    : anchorTick + (seconds - anchorSeconds) / secondsPerTick());

  // A tempo change takes effect at the edge of what is already queued. Notes handed to the audio
  // engine keep the times they were given; everything after `scheduledTo` is timed at the new
  // tempo, starting exactly where the old timeline reaches that tick. Nothing is skipped, played
  // twice or moved, and the change is heard within one lookahead (a quarter of a second).
  function changeTempo(next, now) {
    const boundarySeconds = secondsAt(scheduledTo);
    if (now >= anchorSeconds) previous = { anchorSeconds, anchorTick, tempo };   // else the older mapping still covers "now"
    anchorSeconds = boundarySeconds; anchorTick = scheduledTo; tempo = next;
  }

  function pump() {
    if (!playing) return;
    const project = getProject(), now = audio.now();
    if (project.tempo !== tempo) changeTempo(project.tempo, now);
    const horizon = Math.ceil(tickAt(now + lookahead));
    for (const note of windowNotes(project, scheduledTo, horizon)) {
      audio.schedule({ hz: note.hz, when: secondsAt(note.tick), duration: note.durationTick * secondsPerTick(),
        velocity: note.velocity, voice: note.voice, level: note.level, kind: note.kind });
    }
    scheduledTo = Math.max(scheduledTo, horizon);
    audio.drone(droneState(project));
    if (!project.loop && tickAt(now) >= project.lengthTick) { stop(); return; }
    onState(state());
  }

  function state() {
    const project = getProject();
    const tick = playing ? Math.max(0, tickAt(audio.now())) : 0;
    return { playing, tick: project.loop ? tick % project.lengthTick : Math.min(tick, project.lengthTick), pass: Math.floor(tick / project.lengthTick) };
  }

  function play() {
    if (playing) return;
    const project = getProject();
    playing = true; tempo = project.tempo; previous = null;
    anchorTick = 0; scheduledTo = 0; anchorSeconds = audio.now() + START_DELAY_SECONDS;
    pump();
    handle = timer.set(pump, pumpMs);
  }

  function stop() {
    if (!playing) return;
    playing = false;
    timer.clear(handle); handle = null;
    audio.cancel();
    audio.drone({ on: false });
    onState(state());
  }

  return { play, stop, state, get playing() { return playing; } };
}
