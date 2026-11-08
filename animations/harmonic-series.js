'use strict';
const canvas = document.getElementById('ratioCanvas');
const ctx = canvas.getContext('2d');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const ROOT_HZ = 110, BASE_CYCLES = 6, MANIM_FRAME_WIDTH = 14.222;
const MORPH_START = 3, MORPH_END = 7, SERIES_START = 8, HARMONIC_HOLD = 2;
const ARPEGGIO = SERIES_START + 14 * HARMONIC_HOLD, ARP_STEP = .2;
const TOGETHER = ARPEGGIO + 4, STRUM_GAP = .018;
const FADE_START = TOGETHER + 2.8, DURATION = TOGETHER + 4;
const PLUCK_DURATION = 2.6;
const partialLevel = n => .06 / n**.8;
const PLUCKS = [
  ...Array.from({length:16},(_,i)=>({n:i+1,at:ARPEGGIO+i*ARP_STEP})),
  ...Array.from({length:16},(_,i)=>({n:i+1,at:TOGETHER+i*STRUM_GAP}))
];
// The lab's pure-partial attack, decay, sustain and release envelope.
// Driving the existing sine voices lets us balance their combined level
// continuously, including arpeggio tails overlapping the final chord.
function noteEnvelope(time,at) {
  const age=time-at;
  if(age<0||age>=PLUCK_DURATION)return 0;
  if(age<.015)return age/.015;
  if(age<.165)return 1-(age-.015)/.15*.35;
  if(age<PLUCK_DURATION-.25)return .65;
  return .65*(PLUCK_DURATION-age)/.25;
}
function pluckEnvelope(time,at) {
  const age=time-at;
  return age<0||age>=PLUCK_DURATION ? 0 : (1-age/PLUCK_DURATION)**1.5;
}
const CAPTIONS = ['If we take the top number of the octave and count up by 1 over and over, we get something called the Harmonic (or overtone) series.'];
const clamp = (v,min=0,max=1) => Math.max(min,Math.min(max,v));
const lerp = (a,b,t) => a+(b-a)*t;
function smooth(t,a,b) { const x=clamp((t-a)/(b-a)); return x*x*(3-2*x); }
function stateAt(time) {
  const morph = smooth(time,MORPH_START,MORPH_END);
  const fade = 1-smooth(time,FADE_START,DURATION);
  const black = Math.max(1-smooth(time,0,1.2),1-fade);
  const together = smooth(time,TOGETHER,TOGETHER+.45);
  const strings = Array.from({length:16},(_,i)=>{
    const n=i+1, at=SERIES_START+(n-3)*HARMONIC_HOLD;
    const shown=n<=2 ? 1 : smooth(time,at,at+.55);
    const solo=n===1 ? 1-smooth(time,ARPEGGIO-.12,ARPEGGIO-.03) : n===2 ? 1-smooth(time,SERIES_START-.5,SERIES_START)
      : smooth(time,at,at+.22)*(1-smooth(time,at+HARMONIC_HOLD-.5,at+HARMONIC_HOLD-.08));
    const pluck=Math.max(pluckEnvelope(time,ARPEGGIO+i*ARP_STEP),pluckEnvelope(time,TOGETHER+i*STRUM_GAP));
    const sounding=Math.max(solo,pluck)*fade;
    // Higher pure partials need less level than the bass reference. Keep their
    // exact frequencies, but roll off their level and soften each entrance.
    const droneGain=solo*(n===1 ? .07 : partialLevel(n))*fade;
    const endingGain=partialLevel(n)*PLUCKS.reduce((sum,note)=>
      sum+(note.n===n ? noteEnvelope(time,note.at) : 0),0);
    return {n,shown,sounding,gain:droneGain,droneGain,endingGain};
  });
  if(time>=ARPEGGIO) {
    // Hold the same energy as the preceding bass-led examples, distributing
    // it across the actual active notes instead of a fixed voice count.
    const energy=Math.sqrt(strings.reduce((sum,v)=>sum+v.endingGain**2,0));
    const target=.07*smooth(time,ARPEGGIO,ARPEGGIO+.04)
      *(1-smooth(time,TOGETHER+2.3,TOGETHER+2.9));
    const scale=energy>1e-8 ? target/energy : 0;
    strings.forEach(v=>{v.gain=v.endingGain*scale;});
  }
  return {morph,fade,black,together,strings};
}
let w=1,h=1,clock=0,last=performance.now(),progress=0,playing=false,muted=false;
let captionLayout={size:16,lines:[]};
function resize() {
  const rect=canvas.getBoundingClientRect();
  w=Math.max(1,rect.width); h=Math.max(1,rect.height);
  const dpr=Math.min(window.devicePixelRatio||1,2);
  canvas.width=Math.round(w*dpr); canvas.height=Math.round(h*dpr);
  ctx.setTransform(dpr,0,0,dpr,0,0); layoutCaptions();
}
    // ----- theme -----
    const THEMES = {
      dark: {
        ground: ["#1e1f26", "#283c63"], ink: "#f0f0f0", inkMuted: "#a8dadc", hairline: "rgba(233,197,106,0.36)",
        root: "#f4a261", sounding: "#a8dadc", gold: "#e9c46a", goldLo: "#b8892b", goldHi: "#fff1c4", goldInk: "#e9c46a"
      },
      light: {
        ground: ["#f7f4ec", "#f7f4ec"], ink: "#121933", inkMuted: "#565c70", hairline: "#dcd5c6",
        root: "#6b1d34", sounding: "#1640c8", gold: "#b8892b", goldLo: "#7a5a1c", goldHi: "#e9cf8a", goldInk: "#7a5a1c"
      }
    };
    function themeName() {
      const set = document.documentElement.dataset.theme;
      if (set === "light" || set === "dark") return set;
      return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    }
    let colors = THEMES[themeName()];
    function applyTheme() { colors = THEMES[themeName()]; draw(); }

    function captionFont(size) {
      return `400 ${size}px Montserrat, "Helvetica Neue", Arial, system-ui, sans-serif`;
    }
    function wrap(text, maxWidth) {
      const words = text.split(/\s+/);
      const lines = [];
      let current = "";
      for (const word of words) {
        const trial = current ? current + " " + word : word;
        if (ctx.measureText(trial).width <= maxWidth || !current) current = trial;
        else { lines.push(current); current = word; }
      }
      if (current) lines.push(current);
      return lines;
    }
    // One size for every caption; step down only if the longest would overflow its panel.
    function layoutCaptions() {
      const panelH = h / 4;
      const maxWidth = Math.max(40, Math.min(680, w - 32));
      for (let size = Math.max(13, Math.min(22, h * 0.036)); size >= 10; size -= 1) {
        ctx.font = captionFont(size);
        const lines = CAPTIONS.map(text => wrap(text, maxWidth));
        const tallest = Math.max(...lines.map(l => l.length)) * size * 1.5;
        if (tallest <= panelH * 0.9 || size <= 10) { captionLayout = { size, lines }; return; }
      }
    }

    // One gold foil shared by every gold element, laid across the full width so waves, boxes,
    // the bass and the ratio all match. At a lock a bright band sweeps across all of it at once.
    const FOIL = [[0, "goldLo"], [0.35, "gold"], [0.5, "goldHi"], [0.65, "gold"], [1, "goldLo"]];
    function foilAt(x) {
      for (let i = 1; i < FOIL.length; i += 1) {
        if (x <= FOIL[i][0]) {
          const [x0, c0] = FOIL[i - 1], [x1, c1] = FOIL[i];
          return mix(colors[c0], colors[c1], (x - x0) / (x1 - x0));
        }
      }
      return colors.goldLo;
    }
    function goldFoil(sheen) {
      const g = ctx.createLinearGradient(0, 0, w, 0);
      let stops = FOIL.map(([x, c]) => [x, colors[c]]);
      if (sheen >= 0 && !reducedMotion.matches) {
        const band = 0.12;
        const p = -band + sheen * (1 + 2 * band); // enters at the left edge, leaves at the right
        // the foil's own stops inside the band give way to the highlight
        stops = stops.filter(([x]) => x === 0 || x === 1 || Math.abs(x - p) >= band);
        for (const [x, color] of [[p - band, null], [p - band / 3, colors.goldHi], [p, "#ffffff"], [p + band / 3, colors.goldHi], [p + band, null]]) {
          if (x > 0 && x < 1) stops.push([x, color || foilAt(x)]);
        }
      }
      stops.sort((m, n) => m[0] - n[0]).forEach(([x, color]) => g.addColorStop(x, color));
      return g;
    }

    function mix(a, b, t) {
      const pa = a.match(/\w\w/g).map(x => parseInt(x, 16));
      const pb = b.match(/\w\w/g).map(x => parseInt(x, 16));
      return "#" + pa.map((v, i) => Math.round(v + (pb[i] - v) * t).toString(16).padStart(2, "0")).join("");
    }

    function drawFraction(frac, cy, sheen) {
      if (!frac || frac.alpha <= 0.001) return;
      const panelH = h / 4;
      ctx.save();
      ctx.globalAlpha = frac.alpha;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      {
        const size = panelH * 0.3;
        const gap = panelH * 0.03;
        const fill = goldFoil(sheen);
        ctx.fillStyle = fill;
        ctx.strokeStyle = fill;
        ctx.font = `500 ${size}px "IBM Plex Mono", ui-monospace, monospace`;
        ctx.fillText(frac.text[0], w / 2, cy - size / 2 - gap);
        ctx.fillText(frac.text[1], w / 2, cy + size / 2 + gap);
        ctx.lineWidth = Math.max(2, size * 0.07);
        ctx.lineCap = "butt";
        ctx.beginPath();
        ctx.moveTo(w / 2 - size * 0.45, cy);
        ctx.lineTo(w / 2 + size * 0.45, cy);
        ctx.stroke();
      }
      ctx.restore();
    }

    function drawCaption(caption, cy) {
      if (!caption || caption.alpha <= 0.001) return;
      const lines = caption.text ? [caption.text] : captionLayout.lines[caption.index];
      if (!lines) return;
      const lineH = captionLayout.size * 1.5;
      const startY = cy - ((lines.length - 1) * lineH) / 2;
      ctx.save();
      ctx.globalAlpha = caption.alpha;
      ctx.fillStyle = colors.ink;
      ctx.font = captionFont(captionLayout.size);
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      lines.forEach((line, i) => ctx.fillText(line, w / 2, startY + i * lineH));
      ctx.restore();
    }


function drawString(voice,s) {
  if(voice.shown<=0) return;
  const n=voice.n, m=n<=2?s.morph:1;
  const rowHeight=h*.69/16, targetY=h*.77-(n-1)*rowHeight;
  const oldY=n===1?h*.625:h*.125;
  const y=lerp(oldY,targetY,m), amp=lerp(h*.1,rowHeight*.38,m);
  const left=lerp(0,Math.min(44,w*.1),m), right=lerp(w,w-Math.min(72,w*.18),m);
  const phase=reducedMotion.matches?0:clock;
  const activity=.15+.85*voice.sounding;
  ctx.save(); ctx.globalAlpha=voice.shown;
  ctx.strokeStyle=goldFoil(s.together>0?(progress*DURATION-TOGETHER)/6:-1);
  ctx.lineWidth=lerp(Math.max(2,h*.005),voice.sounding>.1?2:1,m);
  const trace=(ghost=false)=>{
    ctx.beginPath();
    const steps=Math.max(240,n*24);
    for(let i=0;i<=steps;i++) {
      const u=i/steps, x=lerp(left,right,u);
      const travelling=Math.cos(2*Math.PI*BASE_CYCLES*n*(u-phase/MANIM_FRAME_WIDTH));
      const standing=Math.sin(n*Math.PI*u)*(ghost?1:Math.cos(2*Math.PI*n*phase*.3));
      const displacement=lerp(travelling,standing*(ghost?.65:activity),m);
      const py=y-amp*displacement;
      if(i)ctx.lineTo(x,py);else ctx.moveTo(x,py);
    }
    ctx.stroke();
  };
  if(m>.001) { ctx.globalAlpha=voice.shown*m*.18; trace(true); }
  ctx.globalAlpha=voice.shown; trace();
  ctx.globalAlpha=voice.shown*m; ctx.fillStyle=colors.inkMuted;
  for(let k=0;k<=n;k++) { ctx.beginPath();ctx.arc(lerp(left,right,k/n),y,k===0||k===n?2:1.1,0,Math.PI*2);ctx.fill(); }
  ctx.fillStyle=voice.sounding>.1?colors.goldInk:colors.inkMuted;
  ctx.font='500 '+Math.max(9,Math.min(13,rowHeight*.65))+'px "IBM Plex Mono",monospace';
  ctx.textAlign='left';ctx.textBaseline='middle';ctx.fillText(n+'/1',right+12,y);
  ctx.restore();
}
let current=stateAt(0);
function draw() {
  const s=stateAt(progress*DURATION);current=s;
  ctx.clearRect(0,0,w,h);
  const ground=ctx.createLinearGradient(0,0,w,h);ground.addColorStop(0,colors.ground[0]);ground.addColorStop(1,colors.ground[1]);
  ctx.fillStyle=ground;ctx.fillRect(0,0,w,h);
  s.strings.forEach(voice=>drawString(voice,s));
  drawFraction({text:['2','1'],alpha:1-s.morph},h*.375,-1);
  drawCaption({index:0,alpha:1},h*.89);
  // Fade the entire scene, including the background, labels and caption.
  ctx.save();
  ctx.globalAlpha=s.black;
  ctx.fillStyle='#000';
  ctx.fillRect(0,0,w,h);
  ctx.restore();
  updateAudio(s);
}
// Exact harmonic frequencies throughout; the envelope alone controls entrances.
let audioStarted=false,audioGeneration=0;
const voiceId=n=>'harmonic-series-'+n;
function isVisible() {
  const host=window.frameElement?.closest('.sectionLayer');
  return !document.hidden&&(!host||host.classList.contains('active'));
}
function silenceAudio() {
  audioGeneration++;audioStarted=false;
  if(!window.XenAudio)return;
  XenAudio.stopAll();
}
async function startAudio() {
  silenceAudio();
  if(!window.XenAudio||!isVisible()||muted||!playing)return;
  XenAudio.setMasterVolume(.5);
  XenAudio.configurePlayback({outputCeiling:.18});
  const token=audioGeneration;
  for(let n=1;n<=16;n++) {
    if(token!==audioGeneration||!playing||muted||!isVisible())return;
    if(!(await XenAudio.startDrone({id:voiceId(n),frequency:ROOT_HZ*n,gain:.000001,voice:'partial'})))return;
  }
  if(token!==audioGeneration)return;
  audioStarted=true;updateAudio(current);
}
function updateAudio(s) {
  if(!audioStarted||!playing||muted||!isVisible())return;
  s.strings.forEach(v=>XenAudio.updateDrone({id:voiceId(v.n),frequency:ROOT_HZ*v.n,gain:v.gain,rampTime:.015}));
}
function setProgress(value) {
  const next=clamp(Number(value)||0),delta=(next-progress)*DURATION;
  const seeking=delta<0||delta>.25;
  if(seeking) silenceAudio();
  progress=next;draw();
  if(seeking&&playing&&!muted) startAudio();
}
function frame(now) {
  if(playing)clock+=Math.min(48,now-last)/1000;
  last=now;draw();requestAnimationFrame(frame);
}
window.addEventListener('lesson-audio-stop',()=>{playing=false;silenceAudio();});
document.addEventListener('visibilitychange',()=>{if(document.hidden){playing=false;silenceAudio();}});
    window.addEventListener("message", event => {
      if (event.source !== window.parent || event.origin !== location.origin) return;
      const message = event.data || {};

      if (message.type === "lesson-animation-progress") setProgress(message.progress);
      if (message.type === "lesson-animation-play") {
        playing = true;
        if (!(Number(message.progress) > 0)) clock = 0; // crests start at the left edge
        startAudio().catch(() => { playing = false; silenceAudio(0.015); });
        setProgress(message.progress);
      }
      if (message.type === "lesson-animation-pause") { playing = false; silenceAudio(0.015); }
      if (message.type === "lesson-animation-reset") { playing = false; clock = 0; setProgress(0); silenceAudio(0.015); }
      if (message.type === "lesson-animation-finish") { playing = false; setProgress(1); silenceAudio(0.035); }
      if (message.type === "lesson-animation-mute") { muted = Boolean(message.muted); if (muted) silenceAudio(); else if (playing) startAudio(); }
      if (message.type === "lesson-theme" && (message.theme === "light" || message.theme === "dark")) {
        document.documentElement.dataset.theme = message.theme;
        applyTheme();
      }
    });

    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", applyTheme);
    window.addEventListener("storage", event => {
      if (event.key !== "theme") return;
      if (event.newValue === "light" || event.newValue === "dark") document.documentElement.dataset.theme = event.newValue;
      else delete document.documentElement.dataset.theme;
      applyTheme();
    });

    let resizeTimer = null;
    window.addEventListener("resize", () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => { resize(); draw(); }, 120);
    });

    // Re-measure captions once the brand faces have loaded.
    if (document.fonts && document.fonts.load) {
      Promise.all([
        document.fonts.load(`400 16px Montserrat`),
        document.fonts.load(`500 16px "IBM Plex Mono"`)
      ]).then(() => { layoutCaptions(); draw(); }).catch(() => {});
    }

    // Exposed for the lesson's duration check.
    window.HARMONIC_ANIMATION_DURATION = DURATION;

    resize();
    draw();
    requestAnimationFrame(frame);
