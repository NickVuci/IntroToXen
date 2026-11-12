(function () {
  "use strict";

  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  const OfflineContextClass = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  const drones = new Map();
  const scheduledVoices = new Set();
  let active = true;
  let playbackGeneration = 0;
  let noteGeneration = 0;
  try {
    const section = window.frameElement?.closest(".sectionLayer");
    if (section) active = section.classList.contains("active");
  } catch (_) { /* Standalone and cross-origin embeds default to active. */ }

  function setActive(value) {
    active = Boolean(value);
    if (active) return;
    stopAll();
    window.dispatchEvent(new Event("lesson-audio-stop"));
  }

  function stopAll() {
    playbackGeneration += 1;
    pendingDrones.clear();
    stopNotes();
    drones.forEach(drone => {
      releaseVoice(drone);
    });
    drones.clear();
  }

  function stopNotes() {
    noteGeneration += 1;
    scheduledVoices.forEach(voice => {
      releaseVoice(voice);
    });
    scheduledVoices.clear();
  }

  function releaseVoice(voice) {
    const now = audioContext.currentTime;
    // A separate gain preserves the note's envelope and the drone's current
    // level while fading. Future notes are cancelled before they can start.
    const end = voice.when > now ? now : now + 0.08;
    voice.release.gain.setValueAtTime(1, now);
    voice.release.gain.linearRampToValueAtTime(0, end);
    voice.main.stop(end);
    voice.color.stop(end);
  }

  let audioContext = null;
  let masterGain = null;
  let compressor = null;
  let muted = false;
  let masterVolume = 0.86;
  let voiceLimit = 64;
  let outputCeiling = 0.8;
  let outputLimiter = null;
  let keepRunning = false; // resume if the browser suspends output (it can when a microphone opens)
  let pageSuspended = false;

  function watchState() {
    if (!audioContext) return;
    audioContext.onstatechange = keepRunning
      ? () => { if (!pageSuspended && active && audioContext.state === "suspended") audioContext.resume().catch(() => {}); }
      : null;
  }

  function limiterCurve(ceiling) {
    const curve = new Float32Array(8193);
    for (let i = 0; i < curve.length; i++) {
      const input = i * 2 / (curve.length - 1) - 1;
      curve[i] = ceiling * Math.tanh(input / ceiling);
    }
    return curve;
  }

  function configurePlayback(options = {}) {
    // Up to 1024: pages that schedule long passages ahead (the Reference Library) need room for every note.
    if (Number.isFinite(options.maxVoices)) voiceLimit = Math.max(1, Math.min(1024, Math.floor(options.maxVoices)));
    if (typeof options.keepRunning === "boolean") {
      keepRunning = options.keepRunning;
      watchState();
    }
    if (Number.isFinite(options.outputCeiling)) {
      outputCeiling = clamp(options.outputCeiling, 0.02, 0.8);
      if (outputLimiter) outputLimiter.curve = limiterCurve(outputCeiling);
    }
  }

  const voices = {
    partial: {
      waveform: "sine", colorWaveform: "sine", colorGain: 0,
      attack: 0.015, decay: 0.15, sustain: 0.65, release: 0.25,
      filterFrequency: 20000, gain: 0.12
    },
    default: {
      waveform: "sine",
      colorWaveform: "triangle",
      colorGain: 0.055,
      attack: 0.012,
      decay: 0.07,
      sustain: 0.72,
      release: 0.16,
      filterFrequency: 4200,
      gain: 0.15
    },
    soft: {
      waveform: "sine",
      colorWaveform: "triangle",
      colorGain: 0.035,
      attack: 0.02,
      decay: 0.1,
      sustain: 0.65,
      release: 0.22,
      filterFrequency: 3600,
      gain: 0.12
    },
    // Harmonic-rich drone for tuning demos: every harmonic is present, so
    // mistuned just intervals beat clearly and locked ones go still.
    bright: {
      waveform: "sawtooth",
      colorWaveform: "triangle",
      colorGain: 0.02,
      attack: 0.08,
      decay: 0.2,
      sustain: 1,
      release: 0.35,
      filterFrequency: 1500,
      gain: 0.07
    },
    // Plucked, harp-like note: quick attack, then a natural decay.
    pluck: {
      waveform: "triangle",
      colorWaveform: "sine",
      colorGain: 0.25,
      attack: 0.004,
      decay: 0.5,
      sustain: 0.12,
      release: 0.4,
      filterFrequency: 3200,
      gain: 0.14
    },
    // Warm sustained pad for held chords (use with startDrone).
    pad: {
      waveform: "triangle",
      colorWaveform: "sine",
      colorGain: 0.3,
      attack: 0.3,
      decay: 0.3,
      sustain: 1,
      release: 0.8,
      filterFrequency: 2000,
      gain: 0.05
    },
    drone: {
      waveform: "sine",
      colorWaveform: "triangle",
      colorGain: 0.025,
      attack: 0.08,
      decay: 0.2,
      sustain: 1,
      release: 0.35,
      filterFrequency: 3200,
      gain: 0.11
    }
  };

  function isAvailable() {
    return Boolean(AudioContextClass);
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, Number(value) || 0));
  }

  function voicePreset(name) {
    return voices[name] || voices.default;
  }

  // Pages can add their own timbres (the Reference Library's and the Practice Room's), so every
  // page plays through this one engine. A voice with `harmonics` (amplitudes of partials 1, 2, 3...)
  // uses that spectrum in place of `waveform`.
  const NUMERIC = ["colorGain", "attack", "decay", "sustain", "release", "filterFrequency", "gain"];
  function defineVoice(name, preset = {}) {
    const key = String(name || "");
    if (!key) throw new Error("A voice needs a name.");
    const base = { ...voices.default, colorGain: 0 };
    const voice = { ...base, ...preset };
    NUMERIC.forEach(field => {
      if (!Number.isFinite(Number(voice[field])) || Number(voice[field]) < 0) throw new Error(`Voice "${key}": ${field} must be a number of at least 0.`);
      voice[field] = Number(voice[field]);
    });
    if (voice.harmonics !== undefined) {
      if (!Array.isArray(voice.harmonics) || !voice.harmonics.length || voice.harmonics.some(a => !Number.isFinite(Number(a)))) {
        throw new Error(`Voice "${key}": harmonics must be a list of partial amplitudes.`);
      }
      voice.harmonics = voice.harmonics.map(Number);
    }
    voices[key] = Object.freeze(voice);
    return key;
  }

  const waveCache = new WeakMap(); // context -> Map(voice preset -> PeriodicWave)
  function setWaveform(oscillator, context, preset) {
    if (!preset.harmonics || typeof context.createPeriodicWave !== "function") {
      oscillator.type = preset.waveform;
      return;
    }
    if (!waveCache.has(context)) waveCache.set(context, new Map());
    const cache = waveCache.get(context);
    if (!cache.has(preset)) {
      const size = preset.harmonics.length + 1;
      const real = new Float32Array(size);
      const imag = new Float32Array(size);
      preset.harmonics.forEach((amplitude, i) => { imag[i + 1] = amplitude; });
      cache.set(preset, context.createPeriodicWave(real, imag));
    }
    oscillator.setPeriodicWave(cache.get(preset));
  }

  function outputGainValue() {
    return muted ? 0 : masterVolume;
  }

  function makeOutputGraph(context, destination) {
    const output = context.createGain();
    connectProtectedOutput(context, output, destination);
    output.gain.value = 0.92;
    return output;
  }

  function connectProtectedOutput(context, input, destination) {
    const comp = context.createDynamicsCompressor();
    comp.threshold.value = -24;
    comp.knee.value = 12;
    comp.ratio.value = 12;
    comp.attack.value = 0.003;
    comp.release.value = 0.25;
    // A second, fast high-ratio stage catches dense strums and chord peaks.
    const peaks = context.createDynamicsCompressor();
    peaks.threshold.value = -8;
    peaks.knee.value = 0;
    peaks.ratio.value = 20;
    peaks.attack.value = 0.001;
    peaks.release.value = 0.12;
    const headroom = context.createGain();
    headroom.gain.value = 0.7;
    input.connect(comp);
    comp.connect(peaks);
    peaks.connect(headroom);
    // Compressors can add makeup gain and let fast transients through. Bound
    // the final samples after both stages, with a smooth saturation curve.
    const limiter = context.createWaveShaper();
    limiter.curve = limiterCurve(outputCeiling);
    limiter.oversample = 'none';
    headroom.connect(limiter);
    limiter.connect(destination);
    if (context === audioContext) outputLimiter = limiter;
    return comp;
  }

  function ensureAudio() {
    if (!isAvailable()) return null;
    if (audioContext) return audioContext;
    audioContext = new AudioContextClass();
    masterGain = audioContext.createGain();
    masterGain.gain.value = outputGainValue();
    compressor = connectProtectedOutput(audioContext, masterGain, audioContext.destination);
    watchState();
    return audioContext;
  }

  async function resume() {
    if (!active) return false;
    const generation = playbackGeneration;
    const context = ensureAudio();
    if (!context) return false;
    pageSuspended = false;
    if (context.state === "suspended") await context.resume();
    return active && generation === playbackGeneration;
  }

  async function suspend() {
    if (!audioContext) return;
    pageSuspended = true;
    await audioContext.suspend();
  }

  function currentTime() {
    const context = ensureAudio();
    return context ? context.currentTime : 0;
  }

  // The context time whose sound is reaching the speakers now. Visual cues that follow the audio
  // use this, which absorbs output latency (large on Bluetooth and some laptops).
  function outputTime() {
    const context = ensureAudio();
    if (!context) return 0;
    try {
      if (context.getOutputTimestamp) {
        const stamp = context.getOutputTimestamp();
        if (stamp && stamp.contextTime > 0) return stamp.contextTime;
      }
    } catch (_) { /* fall through */ }
    return context.currentTime - (context.outputLatency || 0) - (context.baseLatency || 0);
  }

  function setMasterVolume(value) {
    masterVolume = clamp(value, 0, 1.2);
    if (masterGain && audioContext) {
      masterGain.gain.setTargetAtTime(outputGainValue(), audioContext.currentTime, 0.015);
    }
  }

  function setMuted(value) {
    muted = Boolean(value);
    if (masterGain && audioContext) {
      masterGain.gain.setTargetAtTime(outputGainValue(), audioContext.currentTime, 0.015);
    }
    if (muted) {
      drones.forEach((drone, id) => stopDrone(id, 0.025));
    }
  }

  function scheduleVoice(destination, options) {
    const context = destination.context;
    if (context === audioContext) {
      for (const voice of scheduledVoices) {
        if (options.id && voice.id === options.id) {
          releaseVoice(voice);
          scheduledVoices.delete(voice);
        }
      }
      while (scheduledVoices.size >= voiceLimit) {
        const oldest = scheduledVoices.values().next().value;
        releaseVoice(oldest);
        scheduledVoices.delete(oldest);
      }
    }
    const preset = voicePreset(options.voice);
    const frequency = Math.max(1, Number(options.frequency) || 440);
    const duration = Math.max(0.04, Number(options.duration) || 0.6);
    const gainAmount = Math.max(0, Number(options.gain) || preset.gain);
    const when = Math.max(context.currentTime, Number(options.when) || context.currentTime);
    const attack = Math.min(duration * 0.4, preset.attack);
    const decay = Math.min(duration * 0.4, preset.decay);
    const releaseDuration = Math.min(duration * 0.5, preset.release);
    const sustainStart = when + attack + decay;
    const releaseStart = Math.max(sustainStart, when + duration - releaseDuration);

    const main = context.createOscillator();
    const color = context.createOscillator();
    const mainGain = context.createGain();
    const colorGain = context.createGain();
    const envelope = context.createGain();
    const release = context.createGain();
    const filter = context.createBiquadFilter();

    setWaveform(main, context, preset);
    color.type = preset.colorWaveform;
    main.frequency.setValueAtTime(frequency, when);
    color.frequency.setValueAtTime(frequency * 2, when);
    mainGain.gain.setValueAtTime(1, when);
    colorGain.gain.setValueAtTime(preset.colorGain, when);
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(preset.filterFrequency, when);
    filter.Q.setValueAtTime(0.45, when);

    envelope.gain.setValueAtTime(0, when);
    envelope.gain.linearRampToValueAtTime(gainAmount, when + attack);
    envelope.gain.linearRampToValueAtTime(gainAmount * preset.sustain, sustainStart);
    envelope.gain.setValueAtTime(gainAmount * preset.sustain, releaseStart);
    envelope.gain.linearRampToValueAtTime(0.000001, when + duration);

    main.connect(mainGain);
    color.connect(colorGain);
    mainGain.connect(filter);
    colorGain.connect(filter);
    filter.connect(envelope);
    envelope.connect(release);
    release.connect(destination);

    if (context === audioContext) {
      const voice = { main, color, envelope, release, when, id: options.id };
      scheduledVoices.add(voice);
      main.onended = () => {
        envelope.disconnect();
        release.disconnect();
        scheduledVoices.delete(voice);
      };
    }

    main.start(when);
    color.start(when);
    main.stop(when + duration + 0.05);
    color.stop(when + duration + 0.05);
  }

  async function playTone(options = {}) {
    const generation = playbackGeneration;
    const notes = noteGeneration;
    if (!(await resume()) || !active || generation !== playbackGeneration || notes !== noteGeneration) return false;
    scheduleVoice(masterGain, {
      id: options.id,
      frequency: options.frequency,
      duration: options.duration,
      gain: options.gain,
      when: options.when,
      voice: options.voice || "default"
    });
    return true;
  }

  function playRatio(options = {}) {
    return playTone({
      frequency: (Number(options.rootFrequency) || 220) * (Number(options.ratio) || 1),
      duration: options.duration,
      gain: options.gain,
      when: options.when,
      voice: options.voice || "default"
    });
  }

  // Drone starts still waiting on resume(), by id. stopDrone() or a newer start for the same id
  // replaces the token, so a start that was cancelled while the context resumed never sounds.
  const pendingDrones = new Map();

  async function startDrone(options = {}) {
    const generation = playbackGeneration;
    const id = String(options.id || "drone");
    const token = {};
    pendingDrones.set(id, token);
    const ready = await resume();
    if (pendingDrones.get(id) !== token) return false; // stopped or superseded while resuming
    pendingDrones.delete(id);
    if (!ready || !active || generation !== playbackGeneration) return false;
    const preset = voicePreset(options.voice || "drone");
    if (drones.has(id)) {
      updateDrone({
        id,
        frequency: options.frequency,
        gain: options.gain,
        rampTime: options.rampTime
      });
      return true;
    }

    const now = audioContext.currentTime;
    const frequency = Math.max(1, Number(options.frequency) || 220);
    const gainAmount = Math.max(0, Number(options.gain) || preset.gain);
    const filter = audioContext.createBiquadFilter();
    const gain = audioContext.createGain();
    const release = audioContext.createGain();
    const main = audioContext.createOscillator();
    const color = audioContext.createOscillator();
    const colorGain = audioContext.createGain();

    filter.type = "lowpass";
    filter.frequency.value = preset.filterFrequency;
    filter.Q.value = 0.45;
    gain.gain.value = 0.000001;
    setWaveform(main, audioContext, preset);
    color.type = preset.colorWaveform;
    main.frequency.value = frequency;
    color.frequency.value = frequency * 2;
    colorGain.gain.value = preset.colorGain;

    main.connect(filter);
    color.connect(colorGain);
    colorGain.connect(filter);
    filter.connect(gain);
    gain.connect(release);
    release.connect(masterGain);
    main.onended = () => {
      gain.disconnect();
      release.disconnect();
    };
    main.start(now);
    color.start(now);
    gain.gain.setTargetAtTime(gainAmount, now, Number(options.rampTime) || 0.045);
    drones.set(id, { main, color, gain, release, colorGain, filter, voice: options.voice || "drone" });
    return true;
  }

  function updateDrone(options = {}) {
    const id = String(options.id || "drone");
    const drone = drones.get(id);
    if (!drone || !audioContext) return false;
    const preset = voicePreset(options.voice || drone.voice || "drone");
    const now = audioContext.currentTime;
    const rampTime = Number(options.rampTime) || 0.035;
    const frequency = Math.max(1, Number(options.frequency) || 220);
    const gainAmount = Math.max(0, Number(options.gain) || 0);
    drone.main.frequency.setTargetAtTime(frequency, now, rampTime);
    drone.color.frequency.setTargetAtTime(frequency * 2, now, rampTime);
    drone.gain.gain.setTargetAtTime(gainAmount, now, rampTime);
    const filterFrequency = Number(options.filterFrequency) || preset.filterFrequency;
    drone.filter.frequency.setTargetAtTime(filterFrequency, now, rampTime);
    return true;
  }

  function stopDrone(id = "drone", rampTime = 0.05) {
    const key = String(id);
    const cancelledStart = pendingDrones.delete(key);
    const drone = drones.get(key);
    if (!drone || !audioContext) return cancelledStart;
    const now = audioContext.currentTime;
    drone.gain.gain.cancelScheduledValues(now);
    drone.gain.gain.setTargetAtTime(0.000001, now, Number(rampTime) || 0.05);
    const stopAt = now + Math.max(0.08, (Number(rampTime) || 0.05) * 5);
    drone.main.stop(stopAt);
    drone.color.stop(stopAt);
    drones.delete(key);
    return true;
  }

  function eventFrequency(event, rootFrequency) {
    if (event.frequency) return Number(event.frequency);
    return (Number(rootFrequency) || 220) * (Number(event.ratio) || 1);
  }

  function scheduleEvents(options = {}) {
    const destination = options.destination || masterGain;
    if (!destination) return false;
    if (destination.context === audioContext && !active) return false;
    const bpm = Number(options.bpm) || 90;
    const secondsPerBeat = 60 / bpm;
    const startTime = Number.isFinite(options.startTime) ? options.startTime : destination.context.currentTime;
    const rootFrequency = Number(options.rootFrequency) || 220;
    const events = Array.isArray(options.events) ? options.events : [];
    events.forEach(event => {
      scheduleVoice(destination, {
        frequency: eventFrequency(event, rootFrequency),
        duration: Math.max(0.05, (Number(event.durationBeats) || 1) * secondsPerBeat),
        gain: event.gain,
        when: startTime + (Number(event.startBeat) || 0) * secondsPerBeat,
        voice: event.voice || options.voice || "default"
      });
    });
    return true;
  }

  async function renderWav(options = {}) {
    if (!OfflineContextClass) return null;
    const durationSeconds = Math.max(0.1, Number(options.durationSeconds) || 4);
    const sampleRate = 44100;
    const offline = new OfflineContextClass(1, Math.ceil(durationSeconds * sampleRate), sampleRate);
    const output = makeOutputGraph(offline, offline.destination);
    scheduleEvents({
      events: options.events,
      rootFrequency: options.rootFrequency,
      destination: output,
      startTime: 0,
      bpm: options.bpm,
      voice: options.voice || "default"
    });
    const buffer = await offline.startRendering();
    const wav = encodeWav(buffer, options.channels || 1);
    if (options.filename) downloadBuffer(wav, options.filename);
    return { buffer, wav };
  }

  function encodeWav(audioBuffer, channels = 1) {
    const channelCount = Math.max(1, Math.min(channels, audioBuffer.numberOfChannels));
    const frameCount = audioBuffer.length;
    const bytesPerSample = 2;
    const blockAlign = channelCount * bytesPerSample;
    const buffer = new ArrayBuffer(44 + frameCount * blockAlign);
    const view = new DataView(buffer);

    writeString(view, 0, "RIFF");
    view.setUint32(4, 36 + frameCount * blockAlign, true);
    writeString(view, 8, "WAVE");
    writeString(view, 12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, channelCount, true);
    view.setUint32(24, audioBuffer.sampleRate, true);
    view.setUint32(28, audioBuffer.sampleRate * blockAlign, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bytesPerSample * 8, true);
    writeString(view, 36, "data");
    view.setUint32(40, frameCount * blockAlign, true);

    const data = Array.from({ length: channelCount }, (_, index) => audioBuffer.getChannelData(index));
    let offset = 44;
    for (let i = 0; i < frameCount; i += 1) {
      for (let channel = 0; channel < channelCount; channel += 1) {
        const sample = Math.max(-1, Math.min(1, data[channel][i]));
        view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
        offset += 2;
      }
    }
    return buffer;
  }

  function writeString(view, offset, string) {
    for (let i = 0; i < string.length; i += 1) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  }

  function downloadBuffer(buffer, filename) {
    const blob = new Blob([buffer], { type: "audio/wav" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  window.XenAudio = {
    stopNotes,
    configurePlayback,
    stopAll,
    setActive,
    resume,
    suspend,
    isAvailable,
    currentTime,
    outputTime,
    defineVoice,
    setMasterVolume,
    setMuted,
    playTone,
    playRatio,
    startDrone,
    updateDrone,
    stopDrone,
    scheduleEvents,
    renderWav,
    encodeWav
  };
}());
