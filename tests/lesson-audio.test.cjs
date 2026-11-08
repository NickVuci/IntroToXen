const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../audio/synth.js'), 'utf8');

function setup() {
  const oscillators = [];
  const notifications = [];
  const ramps = [];
  const param = () => ({ value: 0, setValueAtTime() {}, setTargetAtTime() {},
    linearRampToValueAtTime(value, at) { ramps.push([value, at]); }, cancelScheduledValues() {} });
  class Context {
    constructor() { this.currentTime = 1; this.state = 'running'; }
    createGain() { return { context: this, gain: param(), connect() {}, disconnect() { this.disconnected = true; } }; }
    createDynamicsCompressor() {
      return { threshold: param(), knee: param(), ratio: param(), attack: param(), release: param(), connect() {} };
    }
    createBiquadFilter() { return { frequency: param(), Q: param(), connect() {} }; }
    createOscillator() {
      const node = { frequency: param(), connect() {}, start() {}, stops: [], stop(at) { this.stops.push(at); } };
      oscillators.push(node);
      return node;
    }
  }
  const window = { AudioContext: Context, dispatchEvent: event => notifications.push(event.type) };
  vm.runInNewContext(source, { window, Event });
  return { audio: window.XenAudio, oscillators, notifications, ramps };
}

test('leaving a frame cancels drones, sounding notes and future scheduled notes', async () => {
  const { audio, oscillators, notifications, ramps } = setup();
  await audio.playTone({ frequency: 220 });
  await audio.startDrone({ id: 'root' });
  audio.scheduleEvents({ startTime: 30, events: [{ ratio: 1.5 }] });
  assert.equal(oscillators.length, 6);
  audio.setActive(false);
  assert.ok(oscillators.slice(0, 4).every(node => node.stops.at(-1) === 1.08), 'sounding voices stop after the fade');
  assert.ok(oscillators.slice(4).every(node => node.stops.at(-1) === 1), 'future notes never start');
  assert.equal(ramps.filter(([value, at]) => value === 0 && at === 1.08).length, 2, 'note and drone both fade to silence');
  assert.deepEqual(notifications, ['lesson-audio-stop']);
  assert.equal(await audio.playTone(), false);
  assert.equal(await audio.startDrone(), false);
  assert.equal(audio.scheduleEvents({ events: [{}] }), false);
  assert.equal(oscillators.length, 6);
  audio.setActive(true);
  assert.equal(oscillators.length, 6, 'returning does not restart audio');
  assert.equal(await audio.playTone(), true, 'explicit playback works after returning');
});

test('pending playback cannot leak through a rapid leave and return', async () => {
  const { audio, oscillators } = setup();
  const pendingTone = audio.playTone();
  const pendingDrone = audio.startDrone();
  audio.setActive(false);
  audio.setActive(true);
  assert.equal(await pendingTone, false);
  assert.equal(await pendingDrone, false);
  assert.equal(oscillators.length, 0);
});

test('every accepted template navigation pauses animation and updates frame activity', () => {
  const template = fs.readFileSync(path.join(__dirname, '../template.js'), 'utf8');
  const calls = [];
  const sections = ['animation', 'lab', 'qa'].map((type, index) => ({
    dataset: { sectionType: type },
    classList: { add() {}, remove() {} },
    querySelectorAll: () => [{ contentWindow: { XenAudio: { setActive: active => calls.push([index, active]) } } }]
  }));
  const extract = (start, end) => template.slice(template.indexOf(start), template.indexOf(end));
  vm.runInNewContext(`
    let current = 0, locked = false;
    const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
    ${extract('  function activateSection(', '  function updateNavigation(')}
    ${extract('  function goTo(', '  function next(')}
    goTo(1); goTo(2, true); goTo(0, true);
  `, { sections, window: { setTimeout() {} }, stopAnimationPlayback: () => calls.push('pause'),
    resetAnimationSection: () => calls.push('reset'), updateNavigation() {} });
  assert.deepEqual(calls, ['pause', [0, false], [1, true], [2, false],
    'pause', [0, false], [1, false], [2, true],
    'pause', [0, true], [1, false], [2, false], 'reset']);
});
