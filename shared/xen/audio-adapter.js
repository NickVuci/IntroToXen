// The transport's audio adapter, implemented on the existing XenAudio engine (audio/synth.js).
// Also renders a project to a WAV file with XenAudio's offline renderer.
import { expandProject, droneState } from './transport.js';
import { ticksToSeconds, PPQ } from './project.js';

const DRONE_ID = 'workstation-drone';
const BASE_GAIN = { chords: 0.085, melody: 0.15 };
const gainOf = note => (BASE_GAIN[note.kind] ?? 0.12) * note.level * (note.velocity / 127);

export function createXenAudioAdapter(XenAudio) {
  let droneKey = '';
  return {
    available: () => Boolean(XenAudio?.isAvailable()),
    resume: () => XenAudio.resume(),
    now: () => XenAudio.currentTime(),
    schedule(note) {
      XenAudio.playTone({ frequency: note.hz, when: note.when, duration: note.duration, gain: gainOf(note), voice: note.voice });
    },
    /** Silences scheduled and sounding notes; the drone is left to drone(). */
    cancel: () => XenAudio.stopNotes(),
    drone(state) {
      const key = state.on ? `${state.hz}|${state.voice}|${state.level}` : '';
      if (key === droneKey) return;
      droneKey = key;
      if (!state.on) { XenAudio.stopDrone(DRONE_ID, 0.08); return; }
      XenAudio.startDrone({ id: DRONE_ID, frequency: state.hz, voice: state.voice, gain: 0.07 * state.level });
    },
    /** One audible note now, for auditioning a grid row. */
    audition: (hz, voice = 'pluck') => XenAudio.playTone({ frequency: hz, duration: 0.5, gain: 0.14, voice }),
    stopAll() { droneKey = ''; XenAudio.stopAll(); },
  };
}

/** One pass of the project as XenAudio.scheduleEvents events (beats), drone included. */
export function renderEvents(project) {
  const events = expandProject(project).map(note => ({
    frequency: note.hz, startBeat: note.startTick / PPQ, durationBeats: note.durationTick / PPQ, gain: gainOf(note), voice: note.voice,
  }));
  const drone = droneState(project);
  if (drone.on) events.unshift({ frequency: drone.hz, startBeat: 0, durationBeats: project.lengthTick / PPQ, gain: 0.07 * drone.level, voice: 'drone' });
  return events;
}

export function renderWav(XenAudio, project, filename) {
  return XenAudio.renderWav({ events: renderEvents(project), bpm: project.tempo, rootFrequency: project.tuning.referenceHz,
    durationSeconds: ticksToSeconds(project, project.lengthTick) + 1, filename });
}
