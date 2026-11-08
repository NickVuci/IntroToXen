(() => {
  'use strict';
  HarmonicStrings.theme();
  XenAudio.configurePlayback({ maxVoices: 16, outputCeiling: .18 });
  XenAudio.setMasterVolume(.35);
  const $ = id => document.getElementById(id), bank = $('strings');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let root = 110, low = 1, high = 16, selected = 0, generation = 0;
  let strum = null, timers = [], struck = new Map();
  const chordNotes = new Set();
  const sustained = new Map();
  const CHORDS = [[4,5,6], [4,5,6,7], [8,11,14], [4,5,6,7,9,11]];
  function syncSustains() {
    bank.querySelectorAll('.string').forEach(row => {
      const n = +row.dataset.n;
      row.querySelector('.number').setAttribute('aria-pressed', String(sustained.has(n)));
    });
    $('sustainedChord').textContent = [...sustained.keys()].sort((a,b) => a-b).join(':');
  }
  function resetNotes() {
    generation++; strum = null;
    timers.forEach(clearTimeout); timers = []; struck.clear();
    chordNotes.clear();
    $('presets').querySelectorAll('button').forEach(button => { button.dataset.active = 'false'; });
    $('series').textContent = 'Play series';
  }
  function reset() {
    resetNotes(); sustained.clear(); syncSustains();
  }
  async function toggleSustain(n) {
    const id = `harmonic-held-${n}`;
    if (sustained.has(n)) {
      sustained.delete(n); XenAudio.stopDrone(id,.025); syncSustains(); return;
    }
    const token = {};
    sustained.set(n,token); syncSustains();
    const started = await XenAudio.startDrone({id,frequency:root*n,gain:.04/Math.sqrt(n),voice:'partial'});
    if (sustained.get(n) !== token) {
      if (!sustained.has(n)) XenAudio.stopDrone(id,.025);
      return;
    }
    if (!started) { sustained.delete(n); syncSustains(); }
  }
  window.addEventListener('lesson-audio-stop', reset);
  function stop() { XenAudio.setActive(false); XenAudio.setActive(true); }
  $('stop').onclick = stop;
  document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); });
  function inspect(n) {
    selected = n;
    chordNotes.clear();
    bank.querySelectorAll('.string').forEach(row => row.setAttribute('aria-current', String(+row.dataset.n === n)));
  }
  async function pluck(n) {
    const token = generation;
    inspect(n);
    if (!(await XenAudio.playTone({ id:`harmonic-string-${n}`, frequency:root * n, duration:2.6, voice:'partial', gain:.08 / Math.sqrt(n) })) || token !== generation) return;
    struck.set(n, performance.now());
  }
  function build() {
    bank.replaceChildren(); bank.style.setProperty('--count', high - low + 1);
    for (let n = high; n >= low; n--) {
      const row = document.createElement('div'); row.className = 'string'; row.dataset.n = n;
      row.style.setProperty('--string-colour', `var(${HarmonicStrings.colourToken(n)})`);
      row.innerHTML = `<button type="button" class="number" aria-label="Sustain harmonic ${n}, ${root*n} hertz" aria-pressed="false">${n}</button><button type="button" class="pluckArea" aria-label="Pluck harmonic ${n}, ${root*n} hertz"><canvas aria-hidden="true"></canvas><span class="detail">${n}/1 <small>≡ ${HarmonicStrings.ratio(n)}</small></span></button>`;
      row.querySelector('.number').onclick = () => toggleSustain(n);
      row.querySelector('.pluckArea').onclick = event => { if (event.detail === 0) return pluck(n); };
      bank.append(row);
    }
    syncSustains();
  }
  const rowAt = event => {
    const row = document.elementFromPoint(event.clientX, event.clientY)?.closest('.string');
    return row && bank.contains(row) ? +row.dataset.n : 0;
  };
  bank.addEventListener('pointerdown', event => {
    if (event.target.closest('.number')) return;
    const n = rowAt(event); if (!n) return;
    event.preventDefault(); bank.setPointerCapture(event.pointerId);
    bank.querySelector(`[data-n="${n}"] .pluckArea`).focus({preventScroll:true});
    strum = { id:event.pointerId, last:n }; pluck(n);
  });
  bank.addEventListener('pointermove', event => {
    if (!strum || strum.id !== event.pointerId) return;
    const n = rowAt(event); if (!n || n === strum.last) return;
    const direction = Math.sign(n - strum.last);
    for (let k = strum.last + direction; direction > 0 ? k <= n : k >= n; k += direction) pluck(k);
    strum.last = n;
  });
  ['pointerup','pointercancel','lostpointercapture'].forEach(type => bank.addEventListener(type, () => { strum = null; }));
  $('root').oninput = () => {
    stop(); root = +$('root').value; $('rootValue').textContent = `${root} Hz`; build(); if (selected) inspect(selected);
  };
  ['low','high'].forEach(id => $(id).onchange = () => {
    stop(); const value = Math.max(1, Math.min(64, Math.round(Number($(id).value) || 1)));
    if (id === 'low') { low = value; high = Math.max(low, high); } else { high = value; low = Math.min(low, high); }
    $('low').value = low; $('high').value = high; build();
  });
  $('series').onclick = async () => {
    stop(); const token = generation;
    if (!(await XenAudio.resume()) || token !== generation) return;
    $('series').textContent = 'Playing…';
    const step = Math.min(300, 7000 / (high-low+1));
    for (let n = low; n <= high; n++) timers.push(setTimeout(() => { if (token === generation) pluck(n); }, (n-low)*step));
    timers.push(setTimeout(() => { $('series').textContent = 'Play series'; }, (high-low+1)*step));
  };
  async function playChord(notes, button) {
    XenAudio.stopNotes(); resetNotes(); selected = 0;
    const token = generation;
    if (!(await XenAudio.resume()) || token !== generation) return;
    // Keep every sounding string visible even when the range was narrowed.
    low = Math.min(low, ...notes); high = Math.max(high, ...notes);
    $('low').value = low; $('high').value = high; build();
    const when = XenAudio.currentTime() + .025;
    const played = await Promise.all(notes.map(n => XenAudio.playTone({
      id:`harmonic-string-${n}`, frequency:root*n, when,
      duration:2.6, voice:'partial', gain:.08/Math.sqrt(n)
    })));
    if (token !== generation || !played.every(Boolean)) return;
    const now = performance.now();
    notes.forEach(n => { struck.set(n,now); chordNotes.add(n); });
    button.dataset.active = 'true';
    timers.push(setTimeout(() => {
      chordNotes.clear(); button.dataset.active = 'false';
    },2700));
  }
  CHORDS.forEach(notes => {
    const button = document.createElement('button');
    button.type = 'button'; button.textContent = notes.join(':');
    button.setAttribute('aria-label', `Play chord ${notes.join(':')}`);
    button.onclick = () => playChord(notes,button);
    $('presets').append(button);
  });
  function draw(now) {
    bank.querySelectorAll('.string').forEach(row => {
      const n = +row.dataset.n, age = (now - (struck.get(n) ?? -10000)) / 1000;
      const held = sustained.has(n);
      const amp = held ? .8 : Math.max(0, 1 - age / 2.6) ** 1.5;
      HarmonicStrings.draw(row.querySelector('canvas'), n, reduced.matches ? 0 : now / 1000 * .45, amp, held || n === selected || chordNotes.has(n));
    });
    requestAnimationFrame(draw);
  }
  build(); requestAnimationFrame(draw);
})();
