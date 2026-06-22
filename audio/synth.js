(function () {
  "use strict";

  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  const OfflineContextClass = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  const drones = new Map();

  let audioContext = null;
  let masterGain = null;
  let compressor = null;
  let muted = false;
  let masterVolume = 0.86;

  const voices = {
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

  function outputGainValue() {
    return muted ? 0 : masterVolume;
  }

  function makeOutputGraph(context, destination) {
    const output = context.createGain();
    const comp = context.createDynamicsCompressor();
    output.gain.value = 0.92;
    comp.threshold.value = -18;
    comp.knee.value = 18;
    comp.ratio.value = 8;
    comp.attack.value = 0.005;
    comp.release.value = 0.18;
    output.connect(comp);
    comp.connect(destination);
    return output;
  }

  function ensureAudio() {
    if (!isAvailable()) return null;
    if (audioContext) return audioContext;
    audioContext = new AudioContextClass();
    compressor = audioContext.createDynamicsCompressor();
    masterGain = audioContext.createGain();
    compressor.threshold.value = -18;
    compressor.knee.value = 18;
    compressor.ratio.value = 8;
    compressor.attack.value = 0.005;
    compressor.release.value = 0.18;
    masterGain.gain.value = outputGainValue();
    masterGain.connect(compressor);
    compressor.connect(audioContext.destination);
    return audioContext;
  }

  async function resume() {
    const context = ensureAudio();
    if (!context) return false;
    if (context.state === "suspended") await context.resume();
    return true;
  }

  async function suspend() {
    if (!audioContext) return;
    await audioContext.suspend();
  }

  function currentTime() {
    const context = ensureAudio();
    return context ? context.currentTime : 0;
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
    const preset = voicePreset(options.voice);
    const frequency = Math.max(1, Number(options.frequency) || 440);
    const duration = Math.max(0.04, Number(options.duration) || 0.6);
    const gainAmount = Math.max(0, Number(options.gain) || preset.gain);
    const when = Math.max(context.currentTime, Number(options.when) || context.currentTime);
    const attack = Math.min(duration * 0.4, preset.attack);
    const decay = Math.min(duration * 0.4, preset.decay);
    const release = Math.min(duration * 0.5, preset.release);
    const sustainStart = when + attack + decay;
    const releaseStart = Math.max(sustainStart, when + duration - release);

    const main = context.createOscillator();
    const color = context.createOscillator();
    const mainGain = context.createGain();
    const colorGain = context.createGain();
    const envelope = context.createGain();
    const filter = context.createBiquadFilter();

    main.type = preset.waveform;
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
    envelope.connect(destination);

    main.start(when);
    color.start(when);
    main.stop(when + duration + 0.05);
    color.stop(when + duration + 0.05);
  }

  async function playTone(options = {}) {
    if (!(await resume())) return false;
    scheduleVoice(masterGain, {
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

  async function startDrone(options = {}) {
    if (!(await resume())) return false;
    const id = String(options.id || "drone");
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
    const main = audioContext.createOscillator();
    const color = audioContext.createOscillator();
    const colorGain = audioContext.createGain();

    filter.type = "lowpass";
    filter.frequency.value = preset.filterFrequency;
    filter.Q.value = 0.45;
    gain.gain.value = 0.000001;
    main.type = preset.waveform;
    color.type = preset.colorWaveform;
    main.frequency.value = frequency;
    color.frequency.value = frequency * 2;
    colorGain.gain.value = preset.colorGain;

    main.connect(filter);
    color.connect(colorGain);
    colorGain.connect(filter);
    filter.connect(gain);
    gain.connect(masterGain);
    main.start(now);
    color.start(now);
    gain.gain.setTargetAtTime(gainAmount, now, Number(options.rampTime) || 0.045);
    drones.set(id, { main, color, gain, colorGain, filter, voice: options.voice || "drone" });
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
    drone.filter.frequency.setTargetAtTime(preset.filterFrequency, now, rampTime);
    return true;
  }

  function stopDrone(id = "drone", rampTime = 0.05) {
    const key = String(id);
    const drone = drones.get(key);
    if (!drone || !audioContext) return false;
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
    resume,
    suspend,
    isAvailable,
    currentTime,
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
