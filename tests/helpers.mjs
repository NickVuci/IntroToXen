import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const memoryStorage = () => {
  const map = new Map();
  return { getItem: k => (map.has(k) ? map.get(k) : null), setItem: (k, v) => { map.set(k, String(v)); }, removeItem: k => { map.delete(k); }, map };
};

/** The real audio/synth.js running against a Web Audio stand-in that records every oscillator. */
export function loadXenAudio() {
  const source = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '../audio/synth.js'), 'utf8');
  const oscillators = [];
  const clock = { time: 0 };
  const param = () => ({ value: 0, setValueAtTime() {}, setTargetAtTime() {}, linearRampToValueAtTime() {}, cancelScheduledValues() {} });
  class Context {
    constructor() { this.state = 'running'; this.destination = {}; }
    get currentTime() { return clock.time; }
    createGain() { return { context: this, gain: param(), connect() {}, disconnect() {} }; }
    createWaveShaper() { return { connect() {} }; }
    createDynamicsCompressor() { return { threshold: param(), knee: param(), ratio: param(), attack: param(), release: param(), connect() {} }; }
    createBiquadFilter() { return { frequency: param(), Q: param(), connect() {} }; }
    createOscillator() {
      const node = { connect() {}, start(t) { node.startAt = t; }, stop(t) { node.stopAt = t; } };
      node.frequency = { get value() { return node.hz; }, set value(v) { node.hz = v; }, setValueAtTime(v) { node.hz = v; }, setTargetAtTime(v) { node.hz = v; } };
      oscillators.push(node);
      return node;
    }
  }
  const window = { AudioContext: Context, dispatchEvent() {} };
  vm.runInNewContext(source, { window, Event: class {} });
  // Each voice is a main oscillator followed by a colour oscillator an octave up.
  return { XenAudio: window.XenAudio, clock, mains: () => oscillators.filter((_, i) => i % 2 === 0) };
}

export const settle = () => new Promise(resolve => setImmediate(resolve));
