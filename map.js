(() => {
  const STORAGE_KEY = "intro-to-xen-map-progress";
  const POSITION_KEY = "intro-to-xen-map-positions-mvp"; // new key: the MVP map has a new layout
  const nodes = [
    {
      id: "pitch",
      title: "Pitch",
      x: 40,
      y: 7,
      topics: ["Frequency", "Hertz", "Higher and lower", "Hearing a pitch"],
      lesson: "template.html?lesson=lessons/pitch.json"
    },
    {
      id: "notes",
      title: "Notes",
      x: 40,
      y: 18,
      topics: ["A pitch placed in time", "Start and length", "Notes in a tuning"],
      lesson: "template.html?lesson=lessons/notes.json"
    },
    {
      id: "intervals",
      title: "Intervals",
      x: 40,
      y: 29,
      topics: ["Distance between pitches", "Frequency ratios", "Cents"],
      lesson: "template.html?lesson=lessons/intervals.json"
    },
    {
      id: "generated-collection",
      title: "Generator",
      x: 62,
      y: 23,
      topics: ["Generator", "Stacking", "Modulo period", "Generated collections"],
      lesson: "template.html?lesson=lessons/generated-collection.json"
    },
    {
      id: "moments-of-symmetry",
      title: "MOS",
      x: 85,
      y: 14,
      topics: ["MOS scales", "Large and small steps", "Well-formedness", "Generator chains"],
      lesson: "template.html?lesson=lessons/moments-of-symmetry.json"
    },
    {
      id: "chords",
      title: "Chords",
      x: 13,
      y: 40,
      topics: ["Notes at once", "Stacked intervals", "Chord ratios such as 4:5:6"],
      lesson: "template.html?lesson=lessons/chords.json"
    },
    {
      id: "scales",
      title: "Scales",
      x: 57,
      y: 40,
      topics: ["Ordered pitches", "Steps", "Repeating at a period"],
      lesson: "template.html?lesson=lessons/scales.json"
    },
    {
      id: "period",
      title: "Period",
      x: 85,
      y: 38,
      topics: ["Equivalence interval", "Octaves and non-octaves", "Repeat span", "Scale frame"],
      lesson: "template.html?lesson=lessons/period.json"
    },
    {
      id: "harmonies",
      title: "Harmonies",
      x: 13,
      y: 52,
      topics: ["Chords in succession", "Progressions", "Voice leading"],
      lesson: "template.html?lesson=lessons/harmonies.json"
    },
    {
      id: "just-intonation",
      title: "Just Intonation",
      x: 37,
      y: 52,
      topics: ["Simple ratios", "Consonant intervals", "JI limits", "JI triads"],
      lesson: "template.html?lesson=lessons/just-intonation.json"
    },
    {
      id: "melodies",
      title: "Melodies",
      x: 66,
      y: 52,
      topics: ["Notes in succession", "Contour", "Steps and leaps"],
      lesson: "template.html?lesson=lessons/melodies.json"
    },
    {
      id: "harmonic-series",
      title: "Harmonic Series",
      x: 24,
      y: 64,
      topics: ["Overtones", "Whole-number ratios", "3/2 and 5/4", "Timbre and tuning"],
      lesson: "harmonic-series.html"
    },
    {
      id: "commas",
      title: "Commas",
      x: 52,
      y: 64,
      topics: ["Small intervals", "81/80", "Where JI routes disagree", "Tempering out"],
      lesson: "template.html?lesson=lessons/commas.json"
    },
    {
      id: "neji",
      title: "NEJI",
      x: 87,
      y: 62,
      topics: ["Near-equal JI", "JI approximating an EDO", "Harmonics over a shared fundamental"],
      lesson: "template.html?lesson=lessons/neji.json"
    },
    {
      id: "temperaments",
      title: "Temperament",
      x: 63,
      y: 75,
      topics: ["Tempering", "Commas tempered out", "Mappings", "Consistent approximation"],
      lesson: "template.html?lesson=lessons/temperaments.json"
    },
    {
      id: "otonal-utonal",
      title: "Otonal and Utonal",
      x: 11,
      y: 78,
      topics: ["Harmonic-series chords", "Subharmonic chords", "Mirror images"],
      lesson: "template.html?lesson=lessons/otonal-utonal.json"
    },
    {
      id: "subharmonic-series",
      title: "Subharmonic Series",
      x: 35,
      y: 78,
      topics: ["Undertones", "8:n ratios", "Inversional color", "Octave reduction"],
      lesson: "template.html?lesson=lessons/subharmonic-series.json"
    },
    {
      id: "equal-tuning",
      title: "Equal Tunings",
      x: 87,
      y: 80,
      topics: ["Equal divisions", "Step size", "EDO and EDx", "Approximation"],
      lesson: "template.html?lesson=lessons/equal-tuning.json"
    },
    {
      id: "tonality-diamond",
      title: "Tonality Diamond",
      x: 11,
      y: 93,
      topics: ["Odd-limit harmony", "Ratio grids", "Otonal and utonal sets", "Chord families"],
      lesson: "template.html?lesson=lessons/tonality-diamond.json"
    },
    {
      id: "rtt",
      title: "Regular Temperament Theory",
      x: 42,
      y: 93,
      topics: ["Commas tempered out", "Mappings", "Generators", "Temperament families"],
      lesson: "template.html?lesson=lessons/rtt.json"
    },
    {
      id: "well-temperament",
      title: "Well-Temperament",
      x: 68,
      y: 93,
      topics: ["Unequal tempering", "Every key usable", "Key colour", "Historical tunings"],
      lesson: "template.html?lesson=lessons/well-temperament.json"
    }
  ];

  // The MVP concept map (PROJECT_GUIDE.md). "required" = suggested order, "related" = related idea.
  const links = [
    { from: "pitch", to: "notes", type: "required" },
    { from: "notes", to: "intervals", type: "required" },
    { from: "intervals", to: "chords", type: "required" },
    { from: "intervals", to: "scales", type: "required" },
    { from: "intervals", to: "just-intonation", type: "required" },
    { from: "intervals", to: "generated-collection", type: "required" },
    { from: "intervals", to: "period", type: "required" },
    { from: "generated-collection", to: "moments-of-symmetry", type: "required" },
    { from: "period", to: "moments-of-symmetry", type: "required" },
    { from: "scales", to: "moments-of-symmetry", type: "required" },
    { from: "chords", to: "harmonies", type: "required" },
    { from: "scales", to: "melodies", type: "required" },
    { from: "just-intonation", to: "harmonic-series", type: "required" },
    { from: "just-intonation", to: "commas", type: "required" },
    { from: "just-intonation", to: "neji", type: "required" },
    { from: "harmonic-series", to: "subharmonic-series", type: "required" },
    { from: "harmonic-series", to: "otonal-utonal", type: "required" },
    { from: "subharmonic-series", to: "otonal-utonal", type: "required" },
    { from: "otonal-utonal", to: "tonality-diamond", type: "required" },
    { from: "commas", to: "temperaments", type: "required" },
    { from: "temperaments", to: "rtt", type: "required" },
    { from: "temperaments", to: "well-temperament", type: "required" },
    { from: "equal-tuning", to: "rtt", type: "required" },
    { from: "equal-tuning", to: "well-temperament", type: "required" },
    { from: "equal-tuning", to: "neji", type: "required" },
    { from: "chords", to: "just-intonation", type: "related" },
    { from: "scales", to: "just-intonation", type: "related" },
    { from: "harmonies", to: "just-intonation", type: "related" },
    { from: "just-intonation", to: "melodies", type: "related" }
  ];

  /* ------------------------------------------------------------------ *
   *  Physics. Every concept is a circle with a position and velocity in
   *  pixels. Each frame it is pulled gently toward its home (its saved
   *  place, plus a slow drift), damped, and kept clear of every other
   *  circle and of the map's edges. A held circle follows the pointer
   *  and pushes the others aside; when it is let go, wherever every
   *  circle has settled becomes its new home.
   * ------------------------------------------------------------------ */
  const SPRING = 26;      // pull toward home, per second squared per pixel
  const DAMPING = 9;      // velocity loss per second
  const GAP = 8;          // clear space kept between circle edges, px
  const EDGE = 6;         // clear space kept from the map's edge, px
  const SOLVER_PASSES = 6;
  const SETTLE_POLL_MS = 120; // after a drop, check this often whether everything has come to rest
  const SETTLE_MAX_MS = 1500; // and save the arrangement after at most this long

  const conceptMap = document.querySelector(".conceptMap");
  const lineLayer = document.querySelector(".mapLines");
  const nodeLayer = document.querySelector(".conceptNodes");
  const inspector = document.querySelector(".mapInspector");
  const resetButton = document.querySelector(".mapResetButton");
  const completeCount = document.querySelector(".completeCount");
  const totalCount = document.querySelector(".totalCount");
  const trackFill = document.querySelector(".trackFill");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const SVG_NS = "http://www.w3.org/2000/svg";

  const nodeById = new Map(nodes.map(node => [node.id, node]));
  let selectedId = null;
  let completed = readCompleted();
  let drag = null;              // { id, pointerId, offsetX, offsetY, startX, startY, moved }
  let suppressClickId = null;
  let settleTimer = null;
  let mapW = 1, mapH = 1;
  const bodies = new Map();     // id -> { x, y, vx, vy, r, el }
  const lineEls = [];

  applyStoredPositions();

  /* ----- storage ----- */
  function readCompleted() {
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
      return new Set(Array.isArray(stored) ? stored : []);
    } catch {
      return new Set();
    }
  }
  function saveCompleted() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(completed))); } catch {}
  }
  function applyStoredPositions() {
    try {
      const stored = JSON.parse(localStorage.getItem(POSITION_KEY) || "{}");
      nodes.forEach(node => {
        const saved = stored?.[node.id];
        if (!saved) return;
        if (Number.isFinite(saved.x)) node.x = clamp(saved.x, 5, 95);
        if (Number.isFinite(saved.y)) node.y = clamp(saved.y, 5, 95);
      });
    } catch {}
  }
  function savePositions() {
    const stored = Object.fromEntries(nodes.map(node => [node.id, { x: +node.x.toFixed(2), y: +node.y.toFixed(2) }]));
    try { localStorage.setItem(POSITION_KEY, JSON.stringify(stored)); } catch {}
  }

  /* ----- build the DOM once ----- */
  function build() {
    nodeLayer.replaceChildren();
    lineLayer.replaceChildren();
    lineEls.length = 0;

    links.forEach(link => {
      const line = document.createElementNS(SVG_NS, "line");
      line.classList.add("mapLink", link.type === "required" ? "requiredLink" : "relatedLink");
      lineLayer.appendChild(line);
      lineEls.push({ link, line });
    });

    nodes.forEach(node => {
      const card = document.createElement("button");
      card.type = "button";
      card.className = "conceptNode";
      card.dataset.nodeId = node.id;
      const circle = document.createElement("span");
      circle.className = "circle";
      const title = document.createElement("span");
      title.className = "nodeName";
      title.textContent = node.title;
      circle.appendChild(title);
      card.appendChild(circle);

      card.addEventListener("pointerdown", event => startDrag(event, node.id));
      card.addEventListener("click", () => {
        if (suppressClickId === node.id) { suppressClickId = null; return; }
        selectNode(node.id);
      });
      nodeLayer.appendChild(card);
      bodies.set(node.id, { x: 0, y: 0, vx: 0, vy: 0, r: 40, el: card, placed: false });
    });

    measure();
    fitNames();
  }

  /* ----- geometry ----- */
  function measure() {
    const rect = conceptMap.getBoundingClientRect();
    const oldW = mapW, oldH = mapH;
    mapW = Math.max(1, rect.width);
    mapH = Math.max(1, rect.height);
    bodies.forEach((body, id) => {
      body.r = body.el.offsetWidth / 2 || 40;
      if (!body.placed) {
        const home = homeOf(nodeById.get(id), 0);
        body.x = home.x; body.y = home.y; body.placed = true;
      } else if (oldW > 1 && oldH > 1) {
        body.x *= mapW / oldW; body.y *= mapH / oldH; // keep the arrangement on resize
      }
    });
  }

  // Home in pixels: the saved place, plus a slow drift unless motion is reduced.
  const drift = new Map(nodes.map((node, i) => [node.id, {
    px: 0.8 + i * 1.9, py: 1.4 + i * 1.55, ax: 5 + (i % 3), ay: 4 + (i % 2), sx: 0.17 + i * 0.013, sy: 0.13 + i * 0.011
  }]));
  function homeOf(node, t) {
    let x = (node.x / 100) * mapW;
    let y = (node.y / 100) * mapH;
    if (!reducedMotion.matches) {
      const d = drift.get(node.id);
      x += Math.sin(t * d.sx + d.px) * d.ax;
      y += Math.cos(t * d.sy + d.py) * d.ay;
    }
    return { x, y };
  }

  function clampToMap(body) {
    const minX = body.r + EDGE, maxX = mapW - body.r - EDGE;
    const minY = body.r + EDGE, maxY = mapH - body.r - EDGE;
    body.x = minX > maxX ? mapW / 2 : clamp(body.x, minX, maxX);
    body.y = minY > maxY ? mapH / 2 : clamp(body.y, minY, maxY);
  }

  /* ----- simulation step ----- */
  function step(dt, t) {
    // springs toward home, with damping (a held circle simply follows the pointer)
    bodies.forEach((body, id) => {
      if (drag && drag.id === id) { body.vx = 0; body.vy = 0; return; }
      const home = homeOf(nodeById.get(id), t);
      body.vx += (home.x - body.x) * SPRING * dt;
      body.vy += (home.y - body.y) * SPRING * dt;
      const keep = Math.exp(-DAMPING * dt);
      body.vx *= keep;
      body.vy *= keep;
      body.x += body.vx * dt;
      body.y += body.vy * dt;
    });

    // collisions: push overlapping circles apart. A held circle does not yield,
    // so it shoves the others; two free circles share the push.
    const list = Array.from(bodies.entries());
    for (let pass = 0; pass < SOLVER_PASSES; pass += 1) {
      for (let i = 0; i < list.length; i += 1) {
        for (let j = i + 1; j < list.length; j += 1) {
          const [idA, a] = list[i];
          const [idB, b] = list[j];
          let dx = b.x - a.x;
          let dy = b.y - a.y;
          let dist = Math.hypot(dx, dy);
          const min = a.r + b.r + GAP;
          if (dist >= min) continue;
          if (dist < 0.001) { dx = 1; dy = 0; dist = 1; }
          const nx = dx / dist, ny = dy / dist;
          const overlap = min - dist;
          const aFixed = drag && drag.id === idA;
          const bFixed = drag && drag.id === idB;
          const shareA = aFixed ? 0 : bFixed ? 1 : 0.5;
          const shareB = bFixed ? 0 : aFixed ? 1 : 0.5;
          a.x -= nx * overlap * shareA; a.y -= ny * overlap * shareA;
          b.x += nx * overlap * shareB; b.y += ny * overlap * shareB;
          // remove the approaching part of the velocity so pushed circles don't bounce back in
          const rel = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
          if (rel < 0) {
            a.vx += nx * rel * shareA; a.vy += ny * rel * shareA;
            b.vx -= nx * rel * shareB; b.vy -= ny * rel * shareB;
          }
        }
      }
      bodies.forEach(clampToMap);
    }

    // A circle pinned against the map's edge cannot make room, so the held
    // circle stops against it instead of overlapping it.
    if (drag) {
      const held = bodies.get(drag.id);
      for (let pass = 0; pass < 3; pass += 1) {
        bodies.forEach((other, id) => {
          if (id === drag.id) return;
          let dx = held.x - other.x, dy = held.y - other.y;
          let dist = Math.hypot(dx, dy);
          const min = held.r + other.r + GAP;
          if (dist >= min) return;
          if (dist < 0.001) { dx = 0; dy = -1; dist = 1; }
          held.x += (dx / dist) * (min - dist);
          held.y += (dy / dist) * (min - dist);
        });
        clampToMap(held);
      }
    }
  }

  /* ----- drawing ----- */
  function draw() {
    bodies.forEach(body => {
      body.el.style.transform = `translate3d(${(body.x - body.r).toFixed(2)}px, ${(body.y - body.r).toFixed(2)}px, 0)`;
    });
    lineEls.forEach(({ link, line }) => {
      const a = bodies.get(link.from), b = bodies.get(link.to);
      if (!a || !b) return;
      line.setAttribute("x1", ((a.x / mapW) * 100).toFixed(3));
      line.setAttribute("y1", ((a.y / mapH) * 100).toFixed(3));
      line.setAttribute("x2", ((b.x / mapW) * 100).toFixed(3));
      line.setAttribute("y2", ((b.y / mapH) * 100).toFixed(3));
    });
  }

  let last = performance.now();
  function frame(now) {
    const elapsed = Math.min(0.05, (now - last) / 1000);
    last = now;
    // fixed small steps keep the springs stable on slow frames
    const steps = Math.max(1, Math.ceil(elapsed / (1 / 120)));
    for (let k = 0; k < steps; k += 1) step(elapsed / steps, now / 1000);
    draw();
    requestAnimationFrame(frame);
  }

  /* ----- dragging ----- */
  function pointerInMap(event) {
    const rect = conceptMap.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function startDrag(event, id) {
    if (event.button !== 0 || drag) return;
    const body = bodies.get(id);
    const p = pointerInMap(event);
    drag = { id, pointerId: event.pointerId, offsetX: body.x - p.x, offsetY: body.y - p.y, startX: event.clientX, startY: event.clientY, moved: false };
    clearTimeout(settleTimer);
    body.el.classList.add("dragging");
    body.el.setPointerCapture?.(event.pointerId);
  }

  function moveDrag(event) {
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (!drag.moved && Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) > 6) drag.moved = true;
    if (!drag.moved) return;
    const body = bodies.get(drag.id);
    const p = pointerInMap(event);
    body.x = p.x + drag.offsetX;
    body.y = p.y + drag.offsetY;
    clampToMap(body);
    event.preventDefault();
  }

  function endDrag(event, cancelled = false) {
    if (!drag || drag.pointerId !== event.pointerId) return;
    const { id, moved } = drag;
    const body = bodies.get(id);
    body.el.classList.remove("dragging");
    body.el.releasePointerCapture?.(event.pointerId);
    drag = null;
    if (!moved || cancelled) return;
    suppressClickId = id;
    setTimeout(() => { if (suppressClickId === id) suppressClickId = null; }, 0);
    // The dropped circle's home is where it was let go; the circles it pushed
    // settle, and then their resting places become their homes too.
    const node = nodeById.get(id);
    const home = homeOf(node, performance.now() / 1000);
    node.x += ((body.x - home.x) / mapW) * 100;
    node.y += ((body.y - home.y) / mapH) * 100;
    settleAndSave(performance.now());
  }

  // Wait until every circle has come to rest (or a short while has passed), then make
  // each resting place its home, so nothing springs back into a neighbour.
  function settleAndSave(startedAt) {
    clearTimeout(settleTimer);
    settleTimer = setTimeout(() => {
      if (drag) return;
      let fastest = 0;
      bodies.forEach(body => { fastest = Math.max(fastest, Math.hypot(body.vx, body.vy)); });
      if (fastest > 6 && performance.now() - startedAt < SETTLE_MAX_MS) {
        settleAndSave(startedAt);
        return;
      }
      const t = performance.now() / 1000;
      nodes.forEach(node => {
        const body = bodies.get(node.id);
        const home = homeOf(node, t);
        // keep the drift: shift the saved place by how far the circle sits from its home
        node.x += ((body.x - home.x) / mapW) * 100;
        node.y += ((body.y - home.y) / mapH) * 100;
      });
      savePositions();
    }, SETTLE_POLL_MS);
  }

  /* ----- names fit inside their circles: one shared size for all ----- */
  function nameFits(card) {
    const box = card.getBoundingClientRect();
    const cx = box.left + box.width / 2;
    const cy = box.top + box.height / 2;
    const radius = box.width / 2 - 4;
    const range = document.createRange();
    range.selectNodeContents(card.querySelector(".nodeName"));
    return [...range.getClientRects()].every(r =>
      [[r.left, r.top], [r.right, r.top], [r.left, r.bottom], [r.right, r.bottom]]
        .every(([x, y]) => Math.hypot(x - cx, y - cy) <= radius));
  }
  function fitNames() {
    const cards = [...nodeLayer.querySelectorAll(".conceptNode")];
    if (!cards.length) return;
    nodeLayer.style.removeProperty("--name-size");
    const base = parseFloat(getComputedStyle(cards[0].querySelector(".nodeName")).fontSize);
    for (let size = base; size >= 8; size -= 0.5) {
      nodeLayer.style.setProperty("--name-size", `${size}px`);
      if (cards.every(nameFits)) return;
    }
  }

  /* ----- state shown on the map (classes only; nothing is rebuilt) ----- */
  function updateStates() {
    bodies.forEach((body, id) => {
      const done = completed.has(id);
      const node = nodeById.get(id);
      body.el.classList.toggle("selected", id === selectedId);
      body.el.classList.toggle("complete", done);
      body.el.setAttribute("aria-pressed", String(id === selectedId));
      body.el.setAttribute("aria-label", done ? `${node.title}, complete` : node.title);
    });
    lineEls.forEach(({ link, line }) => {
      line.classList.toggle("active", link.from === selectedId || link.to === selectedId);
    });
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function renderInspector() {
    if (!inspector) return;
    inspector.replaceChildren();
    const node = selectedId ? nodeById.get(selectedId) : null;

    if (!node) {
      const empty = document.createElement("div");
      empty.className = "emptyInspector";
      const eyebrow = document.createElement("p");
      eyebrow.className = "eyebrow";
      eyebrow.textContent = "Where to begin";
      const text = document.createElement("p");
      text.textContent = "Start with pitch, or jump to whatever you already know. Choose any concept on the map to see its key ideas and open its lesson.";
      const start = document.createElement("button");
      start.type = "button";
      start.className = "btn primary";
      start.textContent = "Pitch";
      start.addEventListener("click", () => selectNode("pitch"));
      const actions = document.createElement("div");
      actions.className = "inspectorActions";
      actions.appendChild(start);
      empty.append(eyebrow, text, actions);
      inspector.appendChild(empty);
      return;
    }

    const done = completed.has(node.id);
    const eyebrow = document.createElement("p");
    eyebrow.className = "eyebrow";
    eyebrow.textContent = "Concept";

    const title = document.createElement("h2");
    title.textContent = node.title;

    const verdict = document.createElement("p");
    verdict.className = done ? "verdict done" : "verdict";
    verdict.textContent = done ? "Complete." : "";

    const rule = document.createElement("div");
    rule.className = "inspectorRule";

    const label = document.createElement("p");
    label.className = "ideasLabel";
    label.textContent = "Key ideas";
    const list = document.createElement("ul");
    list.className = "ideas";
    node.topics.forEach(topic => {
      const item = document.createElement("li");
      item.textContent = topic;
      list.appendChild(item);
    });

    const actions = document.createElement("div");
    actions.className = "inspectorActions";

    if (node.lesson) {
      const lesson = document.createElement("a");
      lesson.className = "btn primary";
      lesson.href = node.lesson;
      lesson.textContent = "Open lesson";
      actions.appendChild(lesson);
    }

    const complete = document.createElement("button");
    complete.type = "button";
    complete.className = "btn second";
    complete.textContent = done ? "Mark not complete" : "Mark complete";
    complete.addEventListener("click", () => toggleComplete(node.id));
    actions.appendChild(complete);

    const close = document.createElement("button");
    close.type = "button";
    close.className = "closeButton";
    close.setAttribute("aria-label", "Close");
    close.title = "Close";
    close.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
    close.addEventListener("click", () => {
      selectedId = null;
      render();
    });
    const top = document.createElement("div");
    top.className = "inspectorTop";
    top.append(eyebrow, close);

    const head = document.createElement("div");
    head.className = "inspectorHead";
    head.append(title, verdict);

    inspector.append(top, head, rule, label, list, actions);
  }

  function renderStanding() {
    const done = nodes.filter(node => completed.has(node.id)).length;
    if (completeCount) completeCount.textContent = String(done);
    if (totalCount) totalCount.textContent = String(nodes.length);
    if (trackFill) trackFill.style.width = `${(done / nodes.length) * 100}%`;
    if (resetButton) resetButton.disabled = done === 0;
  }

  function selectNode(id) {
    selectedId = id;
    render();
  }

  function toggleComplete(id) {
    if (completed.has(id)) completed.delete(id);
    else completed.add(id);
    saveCompleted();
    render();
  }

  function render() {
    updateStates();
    renderInspector();
    renderStanding();
  }

  resetButton?.addEventListener("click", () => {
    completed = new Set();
    saveCompleted();
    render();
  });

  window.addEventListener("pointermove", moveDrag, { passive: false });
  window.addEventListener("pointerup", event => endDrag(event));
  window.addEventListener("pointercancel", event => endDrag(event, true));

  let resizeTimer = null;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { measure(); fitNames(); }, 120);
  });
  document.fonts?.ready.then(() => { fitNames(); measure(); });

  build();
  render();
  draw();
  requestAnimationFrame(frame);
})();
