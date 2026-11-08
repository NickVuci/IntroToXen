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
  const compressors = [];
  const limiters = [];
  const param = () => ({ value: 0, setValueAtTime() {}, setTargetAtTime() {},
    linearRampToValueAtTime(value, at) { ramps.push([value, at]); }, cancelScheduledValues() {} });
  class Context {
    constructor() { this.currentTime = 1; this.state = 'running'; }
    createGain() { return { context: this, gain: param(), connect(target) { this.target=target; }, disconnect() { this.disconnected = true; } }; }
    createWaveShaper() { const node={connect(target) { this.target=target; }}; limiters.push(node); return node; }
    createDynamicsCompressor() {
      const node = { threshold: param(), knee: param(), ratio: param(), attack: param(), release: param(), connect(target) { this.target=target; } };
      compressors.push(node);
      return node;
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
  return { audio: window.XenAudio, oscillators, notifications, ramps, compressors, limiters };
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

test('stopping playback fades existing notes without deactivating the frame', async () => {
  const {audio,oscillators,notifications}=setup();
  await audio.playTone();
  await audio.startDrone();
  audio.stopAll();
  assert.ok(oscillators.every(node=>node.stops.at(-1)===1.08));
  assert.deepEqual(notifications,[]);
  assert.equal(await audio.playTone(),true);
});

test('stopping chord notes preserves sustained and pending drones', async () => {
  const {audio,oscillators}=setup();
  await audio.startDrone({id:'root'});
  await audio.playTone();
  const pendingNote=audio.playTone();
  const pendingDrone=audio.startDrone({id:'another-root'});
  audio.stopNotes();
  assert.equal(await pendingNote,false);
  assert.equal(await pendingDrone,true);
  assert.equal(oscillators[0].stops.length,0,'root is not stopped');
  assert.equal(oscillators[2].stops.at(-1),1.08,'chord note fades out');
});

test('live notes share a compressor, peak-control stage and output headroom', async () => {
  const {audio,compressors}=setup();
  await audio.playTone();
  await audio.startDrone();
  assert.equal(compressors.length,2,'all voices share the same protected output');
  const [dynamics,peaks]=compressors;
  assert.equal(dynamics.target,peaks);
  assert.equal(dynamics.threshold.value,-24);
  assert.equal(dynamics.ratio.value,12);
  assert.equal(peaks.threshold.value,-8);
  assert.equal(peaks.ratio.value,20);
  assert.equal(peaks.attack.value,.001);
  assert.equal(peaks.target.gain.value,.7);
});

test('dense strums are bounded after compression and repeated strings replace old voices', async () => {
  const {audio,oscillators,compressors,limiters}=setup();
  audio.configurePlayback({maxVoices:16,outputCeiling:.18});
  await audio.playTone({id:'same-string'});
  await audio.playTone({id:'same-string'});
  assert.equal(oscillators[0].stops.at(-1),1.08,'retriggered note fades out');
  for(let n=0;n<100;n++) await audio.playTone({id:`string-${n}`});
  assert.equal(oscillators.filter(node=>node.stops.at(-1)!==1.08).length,32,'at most sixteen two-oscillator voices remain');
  assert.equal(compressors[1].target.target,limiters[0],'ceiling is applied after compression and headroom');
  const curve=limiters[0].curve;
  for(const value of curve) assert.ok(Math.abs(value)<=.180001);
  assert.equal(curve[(curve.length-1)/2],0);
  for(let i=1;i<curve.length;i++) assert.ok(curve[i]>=curve[i-1],'smooth monotonic curve');
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
