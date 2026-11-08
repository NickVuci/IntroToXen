const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

function page() {
  class Element {
    constructor() { this.children = []; this.dataset = {}; this.style = { setProperty() {} }; this.attributes={}; this.parts=new Map(); }
    setAttribute(name,value) { this.attributes[name]=value; }
    addEventListener() {}
    replaceChildren() { this.children = []; }
    append(row) { this.children.push(row); }
    querySelector(selector) { if(!this.parts.has(selector))this.parts.set(selector,new Element());return this.parts.get(selector); }
    querySelectorAll() { return this.children; }
  }
  const elements = new Map(), frames = [], drawn = [];
  const listeners = new Map();
  const window = { addEventListener(type, callback) { listeners.set(type,callback); } };
  const document = {
    getElementById(id) { if (!elements.has(id)) elements.set(id, new Element()); return elements.get(id); },
    createElement: () => new Element(), addEventListener() {}
  };
  return { elements, frames, drawn, globals: {
    window, parent: window, document, performance: { now: () => 1000 },
    matchMedia: () => ({ matches:false }), requestAnimationFrame: callback => frames.push(callback),
    setTimeout: () => 1, clearTimeout() {},
    XenAudio: { configurePlayback() {}, setMasterVolume() {}, stopNotes() {},
      setActive(active) { if(!active) listeners.get('lesson-audio-stop')?.(); } },
    HarmonicStrings: { theme() {}, ratio: n => `${n}/1`, colourToken: () => '--ink', draw: (canvas, n) => drawn.push(n) }
  } };
}

test('harmonic lab creates and draws all sixteen initial strings', () => {
  const state = page();
  vm.runInNewContext(source('applets/harmonic-series.js'), state.globals);
  assert.equal(state.elements.get('strings').children.length, 16);
  state.frames.shift()(1000);
  assert.deepEqual(state.drawn, Array.from({length:16}, (_,i) => 16-i), 'highest string at the top, fundamental at the bottom');
});

test('chord buttons play the requested harmonics together at the protected lab levels', async () => {
  const state=page(), played=[];
  Object.assign(state.globals.XenAudio, {resume:async()=>true,currentTime:()=>10,
    playTone:async options=>{played.push(options);return true;} });
  vm.runInNewContext(source('applets/harmonic-series.js'),state.globals);
  const presets=state.elements.get('presets').children;
  assert.deepEqual(presets.map(button=>button.textContent),['4:5:6','4:5:6:7','8:11:14','4:5:6:7:9:11']);
  for(const button of presets) {
    played.length=0;
    await button.onclick();
    const notes=button.textContent.split(':').map(Number);
    assert.deepEqual(played.map(note=>note.frequency),notes.map(n=>110*n));
    assert.ok(played.every(note=>note.when===10.025&&note.voice==='partial'&&note.duration===2.6));
    notes.forEach((n,i)=>assert.equal(played[i].gain,.08/Math.sqrt(n)));
    assert.equal(button.dataset.active,'true');
  }
});

test('fundamental plucks normally and the sustained chord label tracks sorted selections', async () => {
  const state=page(), played=[],held=[];
  Object.assign(state.globals.XenAudio,{resume:async()=>true,currentTime:()=>10,
    playTone:async note=>{played.push(note);return true;},startDrone:async note=>{held.push(note);return true;},stopDrone() {}});
  vm.runInNewContext(source('applets/harmonic-series.js'),state.globals);
  const row=n=>state.elements.get('strings').children.find(row=>+row.dataset.n===n);
  const label=state.elements.get('sustainedChord');
  await row(1).querySelector('.pluckArea').onclick({detail:0});
  assert.equal(played[0].frequency,110);
  assert.equal(played[0].duration,2.6);
  assert.equal(held.length,0,'plucking harmonic one does not sustain it');
  assert.equal(label.textContent,'');
  for(const n of [11,4,6,1]) await row(n).querySelector('.number').onclick();
  assert.equal(label.textContent,'1:4:6:11');
  assert.equal(held.at(-1).id,'harmonic-held-1');
  assert.equal(held.at(-1).gain,.04);
  await state.elements.get('presets').children[0].onclick();
  assert.equal(label.textContent,'1:4:6:11','chord presets preserve sustained selection');
  await row(1).querySelector('.number').onclick();
  assert.equal(label.textContent,'4:6:11');
  state.elements.get('stop').onclick();
  assert.equal(label.textContent,'');
});

test('number buttons sustain independent harmonics, survive chords and release on toggle or stop', async () => {
  const state=page(), starts=[],stops=[];
  Object.assign(state.globals.XenAudio,{resume:async()=>true,currentTime:()=>10,playTone:async()=>true,
    startDrone:async options=>{starts.push(options);return true;},stopDrone:id=>stops.push(id)});
  vm.runInNewContext(source('applets/harmonic-series.js'),state.globals);
  const number=n=>state.elements.get('strings').children.find(row=>+row.dataset.n===n).querySelector('.number');
  await number(5).onclick(); await number(7).onclick();
  assert.equal(number(5).attributes['aria-pressed'],'true');
  assert.equal(number(7).attributes['aria-pressed'],'true');
  assert.deepEqual(starts.map(note=>note.frequency),[550,770]);
  assert.ok(starts.every(note=>note.voice==='partial'));
  await state.elements.get('presets').children[0].onclick();
  assert.equal(number(5).attributes['aria-pressed'],'true');
  assert.equal(stops.length,0,'chords preserve held notes');
  await number(5).onclick();
  assert.equal(number(5).attributes['aria-pressed'],'false');
  assert.equal(number(7).attributes['aria-pressed'],'true');
  assert.deepEqual(stops,['harmonic-held-5']);
  await number(1).onclick();
  assert.equal(state.elements.get('sustainedChord').textContent,'1:7');
  assert.equal(number(1).attributes['aria-pressed'],'true');
  state.elements.get('stop').onclick();
  assert.equal(number(7).attributes['aria-pressed'],'false');
  assert.equal(number(1).attributes['aria-pressed'],'false');
});

function animationContext(script) {
  const drawing = new Proxy({ measureText: text => ({width:text.length*7}),
    createLinearGradient: () => ({addColorStop() {}}) }, {
    get: (target, key) => target[key] ?? (() => {})
  });
  const canvas = {getContext: () => drawing, getBoundingClientRect: () => ({width:900,height:600})};
  const window = {matchMedia: () => ({matches:false,addEventListener() {}}), addEventListener() {}, innerWidth:900};
  const context = vm.createContext({window, document:{getElementById:()=>canvas,documentElement:{dataset:{}},addEventListener() {}},
    performance:{now:()=>0},matchMedia:window.matchMedia,requestAnimationFrame() {}});
  vm.runInContext(script,context);
  return context;
}

test('octave opens the scene and morphs into the bottom two strings', () => {
  const context=animationContext(source('animations/harmonic-series.js'));
  const at=t=>JSON.parse(vm.runInContext('JSON.stringify(stateAt('+t+'))',context));
  assert.equal(at(0).morph,0);
  assert.equal(at(0).strings.filter(v=>v.shown===1).length,2);
  assert.ok(at(5).morph>0&&at(5).morph<1);
  assert.equal(at(7).morph,1);
  assert.equal(vm.runInContext('CAPTIONS[0]',context),'If we take the top number of the octave and count up by 1 over and over, we get something called the Harmonic (or overtone) series.');
});

test('entire animation fades from black and returns to black at completion', () => {
  const context=animationContext(source('animations/harmonic-series.js'));
  assert.equal(vm.runInContext('stateAt(0).black',context),1);
  assert.equal(vm.runInContext('stateAt(.6).black',context),.5);
  assert.equal(vm.runInContext('stateAt(1.2).black',context),0);
  assert.equal(vm.runInContext('stateAt(FADE_START).black',context),0);
  const middle=vm.runInContext('stateAt((FADE_START+DURATION)/2).black',context);
  assert.ok(Math.abs(middle-.5)<1e-10);
  assert.equal(vm.runInContext('stateAt(DURATION).black',context),1);
});

test('strings enter sequentially, stay visible, and sound together at the end', () => {
  const context=animationContext(source('animations/harmonic-series.js'));
  for(let n=3;n<=16;n++) {
    const state=JSON.parse(vm.runInContext('JSON.stringify(stateAt(SERIES_START+'+(n-3)+'*4+1))',context));
    assert.equal(state.strings.filter(v=>v.shown===1).length,n);
    assert.ok(state.strings[n-1].gain>0);
    assert.ok(state.strings[0].droneGain>0,'fundamental continues under each introduction');
    assert.ok(state.strings.every(v=>v.n===n||v.n===1||v.gain===0));
  }
  const together=JSON.parse(vm.runInContext('JSON.stringify(stateAt(TOGETHER+1))',context));
  assert.ok(together.strings.every(v=>v.shown===1&&v.gain>0));
  const end=JSON.parse(vm.runInContext('JSON.stringify(stateAt(DURATION))',context));
  assert.ok(end.strings.every(v=>v.gain===0));
  const lesson=JSON.parse(source('lessons/harmonic-series.json'));
  assert.equal(vm.runInContext('DURATION*1000',context),lesson.sections.animation.durationMs);
  vm.runInContext('setProgress(.07);draw();setProgress(.5);draw();setProgress(.93);draw();',context);
});

test('ending plucks all sixteen harmonics in order, then strums with the lab sound', () => {
  const context=animationContext(source('animations/harmonic-series.js'));
  const notes=[];
  context.XenAudio={playTone: options=>notes.push(options)};
  vm.runInContext('lastAudioTime=ARPEGGIO-.01; for(let t=ARPEGGIO;t<TOGETHER+1;t+=.01) triggerPlucks(t);',context);
  assert.equal(notes.length,32);
  for(let i=0;i<32;i++) {
    const n=i%16+1;
    assert.equal(notes[i].frequency,110*n);
    assert.equal(notes[i].duration,2.6);
    assert.equal(notes[i].voice,'partial');
    assert.equal(notes[i].gain,.16/Math.sqrt(n));
  }
  notes.length=0;
  vm.runInContext('lastAudioTime=ARPEGGIO-1;triggerPlucks(TOGETHER+1);',context);
  assert.equal(notes.length,0,'seeking does not replay skipped notes');
  for(const time of [63.9,64,66,68,69]) {
    assert.ok(vm.runInContext(`stateAt(${time}).strings[0].droneGain`,context)>0);
  }
});

test('harmonic modes have fixed nodes and correct octave ratios', () => {
  const window = {};
  vm.runInNewContext(source('applets/harmonic-strings.js'), { window });
  const model = window.HarmonicStrings;
  for (let n = 1; n <= 64; n++) {
    for (let k = 0; k <= n; k++) assert.ok(Math.abs(model.displacement(n,k/n,.17)) < 1e-12);
  }
  assert.equal(model.ratio(3),'3/2');
  assert.equal(model.ratio(5),'5/4');
  assert.equal(model.ratio(16),'1/1');
});
