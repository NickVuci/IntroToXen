(function () {
  'use strict';
  const gcd = (a, b) => b ? gcd(b, a % b) : a;
  function ratio(n) {
    const d = 2 ** Math.floor(Math.log2(n)), g = gcd(n, d);
    return `${n / g}/${d / g}`;
  }
  function displacement(n, x, time) {
    return Math.sin(n * Math.PI * x) * Math.cos(2 * Math.PI * n * time);
  }
  // Match hInfo/lpf in the original workbench prototype.
  function colourToken(n) {
    let largest = 1;
    for (let factor = 2; factor * factor <= n; factor++) {
      while (n % factor === 0) { largest = factor; n /= factor; }
    }
    if (n > 1) largest = n;
    return largest <= 2 ? '--ink' : [3,5,7,11,13].includes(largest) ? `--p${largest}` : '--muted';
  }
  function draw(canvas, n, time, amplitude = 0, selected = false) {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    }
    const c = canvas.getContext('2d'), style = getComputedStyle(canvas);
    c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, w, h);
    const ink = style.getPropertyValue('--ink').trim();
    const colour = style.getPropertyValue(colourToken(n)).trim();
    const mid = h / 2, height = Math.max(.2, h / 2 - Math.min(5,h*.18)), width = w - 12;
    c.strokeStyle = colour;
    const trace = (amp, clock) => {
      c.beginPath();
      const steps = Math.max(160, n * 20);
      for (let i = 0; i <= steps; i++) {
        const x = i / steps, y = mid - height * amp * displacement(n, x, clock);
        if (i) c.lineTo(6 + x * width, y); else c.moveTo(6, y);
      }
      c.stroke();
    };
    c.lineWidth = 1; c.globalAlpha = .2; trace(.8, 0); trace(-.8, 0);
    c.globalAlpha = 1; c.lineWidth = selected ? 2.3 : 1.5; trace(amplitude, time);
    c.fillStyle = ink;
    for (let k = 0; k <= n; k++) {
      c.beginPath(); c.arc(6 + width * k / n, mid, Math.min(h*.22,k === 0 || k === n ? 2.5 : 1.3), 0, Math.PI * 2); c.fill();
    }
  }
  function theme() {
    try { const saved = localStorage.getItem('theme'); if (saved === 'light' || saved === 'dark') document.documentElement.dataset.theme = saved; } catch (_) {}
    window.addEventListener('message', event => {
      if (event.source === parent && event.origin === location.origin && event.data?.type === 'lesson-theme') {
        if (['light', 'dark'].includes(event.data.theme)) document.documentElement.dataset.theme = event.data.theme;
      }
    });
  }
  window.HarmonicStrings = { ratio, displacement, colourToken, draw, theme };
}());
