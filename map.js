(() => {
  const STORAGE_KEY = "intro-to-xen-map-progress";
  const POSITION_KEY = "intro-to-xen-map-positions";
  const nodes = [
    {
      id: "harmonic-series",
      tag: "HS",
      title: "Harmonic Series",
      x: 50,
      y: 12,
      topics: ["Overtones", "Whole-number ratios", "3/2 and 5/4", "Timbre and tuning"],
      lesson: "harmonic-series.html"
    },
    {
      id: "just-intonation",
      tag: "JI",
      title: "Just Intonation",
      x: 72,
      y: 32,
      topics: ["Simple ratios", "Consonant intervals", "5/4 and 6/5", "JI triads"],
      lesson: "template.html?lesson=lessons/just-intonation.json"
    },
    {
      id: "subharmonic-series",
      tag: "SH",
      title: "Subharmonic Series",
      x: 18,
      y: 32,
      topics: ["Undertones", "8:n ratios", "Inversional color", "Octave reduction"],
      lesson: "template.html?lesson=lessons/subharmonic-series.json"
    },
    {
      id: "tonality-diamond",
      tag: "TD",
      title: "Tonality Diamond",
      x: 22,
      y: 56,
      topics: ["Odd-limit harmony", "Ratio grids", "Otonal and utonal sets", "Chord families"],
      lesson: "template.html?lesson=lessons/tonality-diamond.json"
    },
    {
      id: "equal-tuning",
      tag: "ET",
      title: "Equal Tuning",
      x: 82,
      y: 84,
      topics: ["Equal divisions", "Step size", "EDO and EDx", "Approximation"],
      lesson: "template.html?lesson=lessons/equal-tuning.json"
    },
    {
      id: "period",
      tag: "P",
      title: "Period",
      x: 50,
      y: 88,
      topics: ["Equivalence interval", "Octaves and non-octaves", "Repeat span", "Scale frame"],
      lesson: "template.html?lesson=lessons/period.json"
    },
    {
      id: "generated-collection",
      tag: "GC",
      title: "Generated Collection",
      x: 18,
      y: 84,
      topics: ["Generator", "Stacking", "Modulo period", "Scale ordering"],
      lesson: "template.html?lesson=lessons/generated-collection.json"
    },
    {
      id: "moments-of-symmetry",
      tag: "MOS",
      title: "Moments of Symmetry",
      x: 50,
      y: 67,
      topics: ["MOS scales", "Large and small steps", "Well-formedness", "Generator chains"],
      lesson: "template.html?lesson=lessons/moments-of-symmetry.json"
    },
    {
      id: "temperaments",
      tag: "T",
      title: "Temperaments",
      x: 78,
      y: 56,
      topics: ["Commas", "Tempering", "Mappings", "Consistent approximation"],
      lesson: "template.html?lesson=lessons/temperaments.json"
    }
  ];

  const links = [
    { from: "harmonic-series", to: "just-intonation", type: "required" },
    { from: "harmonic-series", to: "subharmonic-series", type: "related" },
    { from: "just-intonation", to: "tonality-diamond", type: "required" },
    { from: "just-intonation", to: "temperaments", type: "required" },
    { from: "period", to: "equal-tuning", type: "required" },
    { from: "period", to: "generated-collection", type: "required" },
    { from: "generated-collection", to: "moments-of-symmetry", type: "required" },
    { from: "temperaments", to: "equal-tuning", type: "related" },
    { from: "temperaments", to: "moments-of-symmetry", type: "related" },
    { from: "tonality-diamond", to: "subharmonic-series", type: "related" }
  ];

  const nodeById = new Map(nodes.map(node => [node.id, node]));
  const driftById = new Map(nodes.map((node, index) => [
    node.id,
    {
      phaseX: 0.8 + index * 1.9,
      phaseY: 1.4 + index * 1.55,
      ampX: 0.9 + index * 0.16,
      ampY: 0.65 + index * 0.12,
      speedX: 0.00008 + index * 0.000012,
      speedY: 0.000065 + index * 0.00001
    }
  ]));
  const conceptMap = document.querySelector(".conceptMap");
  const lineLayer = document.querySelector(".mapLines");
  const nodeLayer = document.querySelector(".conceptNodes");
  const inspector = document.querySelector(".mapInspector");
  const resetButton = document.querySelector(".mapResetButton");
  const completeCount = document.querySelector(".completeCount");
  const totalCount = document.querySelector(".totalCount");
  const trackFill = document.querySelector(".trackFill");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  let selectedId = null;
  let completed = readCompleted();
  let dragState = null;
  let suppressClickId = null;
  let displayedPositions = new Map();

  applyStoredPositions();

  function boundsFor(nodeElement) {
    const mapRect = conceptMap?.getBoundingClientRect();
    const nodeRect = nodeElement?.getBoundingClientRect();
    if (!mapRect || !nodeRect || !mapRect.width || !mapRect.height) {
      return { minX: 16, maxX: 84, minY: 18, maxY: 82 };
    }

    const xMargin = (nodeRect.width / 2 / mapRect.width) * 100 + 1.5;
    const yMargin = (nodeRect.height / 2 / mapRect.height) * 100 + 1.5;
    return {
      minX: clamp(xMargin, 10, 42),
      maxX: clamp(100 - xMargin, 58, 90),
      minY: clamp(yMargin, 12, 42),
      maxY: clamp(100 - yMargin, 58, 88)
    };
  }

  function readCompleted() {
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
      return new Set(Array.isArray(stored) ? stored : []);
    } catch {
      return new Set();
    }
  }

  function saveCompleted() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(completed)));
    } catch {
      // Storage blocked: progress lasts for this visit only.
    }
  }

  function applyStoredPositions() {
    try {
      const stored = JSON.parse(localStorage.getItem(POSITION_KEY) || "{}");
      nodes.forEach(node => {
        const saved = stored?.[node.id];
        if (!saved) return;
        if (Number.isFinite(saved.x)) node.x = clamp(saved.x, 10, 90);
        if (Number.isFinite(saved.y)) node.y = clamp(saved.y, 12, 88);
      });
    } catch {
      // Ignore invalid stored positions.
    }
  }

  function savePositions() {
    const stored = Object.fromEntries(nodes.map(node => [node.id, { x: node.x, y: node.y }]));
    try {
      localStorage.setItem(POSITION_KEY, JSON.stringify(stored));
    } catch {
      // Storage blocked: the arrangement lasts for this visit only.
    }
  }

  function driftOffset(node, time = performance.now()) {
    const drift = driftById.get(node.id);
    if (!drift || reducedMotion.matches) return { x: 0, y: 0 };
    return {
      x: Math.sin(time * drift.speedX + drift.phaseX) * drift.ampX,
      y: Math.cos(time * drift.speedY + drift.phaseY) * drift.ampY
    };
  }

  function boundedPosition(x, y, bounds) {
    return {
      x: clamp(x, bounds.minX, bounds.maxX),
      y: clamp(y, bounds.minY, bounds.maxY)
    };
  }

  function displayPosition(node, time = performance.now(), bounds = { minX: 10, maxX: 90, minY: 12, maxY: 88 }) {
    if (dragState?.id === node.id) return { x: dragState.currentX, y: dragState.currentY };

    const offset = driftOffset(node, time);
    return boundedPosition(node.x + offset.x, node.y + offset.y, bounds);
  }

  function nodeElement(id) {
    return nodeLayer.querySelector(`.conceptNode[data-node-id="${id}"]`);
  }

  function svgPoint(node, time = performance.now()) {
    const resolved = displayedPositions.get(node.id);
    if (resolved) return resolved;

    const element = nodeElement(node.id);
    const position = displayPosition(node, time, element ? boundsFor(element) : undefined);
    return { x: position.x, y: position.y };
  }

  function isConnected(link) {
    return link.from === selectedId || link.to === selectedId;
  }

  function renderLines(time = performance.now()) {
    const namespace = "http://www.w3.org/2000/svg";
    lineLayer.replaceChildren();

    links.forEach(link => {
      const from = nodeById.get(link.from);
      const to = nodeById.get(link.to);
      if (!from || !to) return;
      const start = svgPoint(from, time);
      const end = svgPoint(to, time);
      const line = document.createElementNS(namespace, "line");
      line.setAttribute("x1", start.x);
      line.setAttribute("y1", start.y);
      line.setAttribute("x2", end.x);
      line.setAttribute("y2", end.y);
      line.classList.add("mapLink", link.type === "required" ? "requiredLink" : "relatedLink");
      line.classList.toggle("active", isConnected(link));
      lineLayer.appendChild(line);
    });
  }

  function renderNodes() {
    nodeLayer.replaceChildren();

    nodes.forEach(node => {
      const card = document.createElement("button");
      card.type = "button";
      card.className = "conceptNode";
      card.classList.toggle("selected", node.id === selectedId);
      card.classList.toggle("complete", completed.has(node.id));
      card.style.setProperty("--x", node.x);
      card.style.setProperty("--y", node.y);
      card.dataset.nodeId = node.id;
      card.setAttribute("aria-pressed", String(node.id === selectedId));
      card.setAttribute("aria-label", completed.has(node.id) ? `${node.title}, complete` : node.title);

      const hexWrap = document.createElement("span");
      hexWrap.className = "hexWrap";
      hexWrap.setAttribute("aria-hidden", "true");
      const hex = document.createElement("span");
      hex.className = "hex";
      hex.textContent = node.tag;
      hexWrap.appendChild(hex);
      const title = document.createElement("span");
      title.className = "nodeName";
      title.textContent = node.title;

      card.addEventListener("pointerdown", event => startPointerDrag(event, node.id, card));
      card.addEventListener("click", () => {
        if (suppressClickId === node.id) {
          suppressClickId = null;
          return;
        }
        selectNode(node.id);
      });
      card.addEventListener("keydown", event => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        selectNode(node.id);
      });
      card.append(hexWrap, title);
      nodeLayer.appendChild(card);
    });

    updateNodePositions(performance.now());
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
      text.textContent = "Start with the harmonic series. Choose any concept on the map to see its key ideas and open its lesson.";
      const start = document.createElement("button");
      start.type = "button";
      start.className = "btn primary";
      start.textContent = "Harmonic Series";
      start.addEventListener("click", () => selectNode("harmonic-series"));
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

  function startPointerDrag(event, id, card) {
    if (event.button !== 0 || dragState || !conceptMap) return;

    const node = nodeById.get(id);
    if (!node) return;

    const now = performance.now();
    const position = displayPosition(node, now, boundsFor(card));
    dragState = {
      id,
      card,
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      originX: position.x,
      originY: position.y,
      currentX: position.x,
      currentY: position.y,
      moved: false
    };

    card.classList.add("dragging");
    card.setPointerCapture?.(event.pointerId);
  }

  function movePointerDrag(event) {
    if (!dragState || dragState.pointerId !== event.pointerId || !conceptMap) return;

    const rect = conceptMap.getBoundingClientRect();
    const dx = ((event.clientX - dragState.startClientX) / rect.width) * 100;
    const dy = ((event.clientY - dragState.startClientY) / rect.height) * 100;

    if (!dragState.moved && Math.hypot(event.clientX - dragState.startClientX, event.clientY - dragState.startClientY) > 6) {
      dragState.moved = true;
    }

    const position = boundedPosition(dragState.originX + dx, dragState.originY + dy, boundsFor(dragState.card));
    dragState.currentX = position.x;
    dragState.currentY = position.y;
    updateNodePositions(performance.now());
    renderLines(performance.now());
    event.preventDefault();
  }

  function endPointerDrag(event) {
    if (!dragState || dragState.pointerId !== event.pointerId) return;

    const state = dragState;
    const node = nodeById.get(state.id);
    state.card.classList.remove("dragging");
    state.card.releasePointerCapture?.(event.pointerId);
    dragState = null;

    if (node && state.moved) {
      const offset = driftOffset(node, performance.now());
      const position = boundedPosition(state.currentX - offset.x, state.currentY - offset.y, boundsFor(state.card));
      node.x = position.x;
      node.y = position.y;
      suppressClickId = node.id;
      savePositions();
    }

    updateNodePositions(performance.now());
    renderLines(performance.now());
  }

  function cancelPointerDrag(event) {
    if (!dragState || dragState.pointerId !== event.pointerId) return;
    dragState.card.classList.remove("dragging");
    dragState.card.releasePointerCapture?.(event.pointerId);
    dragState = null;
    updateNodePositions(performance.now());
    renderLines(performance.now());
  }

  function collisionEntry(nodeElement, time) {
    const node = nodeById.get(nodeElement.dataset.nodeId || "");
    const mapRect = conceptMap?.getBoundingClientRect();
    const nodeRect = nodeElement.getBoundingClientRect();
    if (!node || !mapRect || !mapRect.width || !mapRect.height) return null;

    const bounds = boundsFor(nodeElement);
    node.x = clamp(node.x, bounds.minX, bounds.maxX);
    node.y = clamp(node.y, bounds.minY, bounds.maxY);

    return {
      id: node.id,
      element: nodeElement,
      bounds,
      locked: dragState?.id === node.id,
      radiusPx: nodeRect.width / 2,
      position: displayPosition(node, time, bounds)
    };
  }

  function separateEntries(entries) {
    const mapRect = conceptMap?.getBoundingClientRect();
    if (!mapRect || !mapRect.width || !mapRect.height) return entries;
    if (dragState) return entries;

    for (let pass = 0; pass < 5; pass += 1) {
      for (let i = 0; i < entries.length; i += 1) {
        for (let j = i + 1; j < entries.length; j += 1) {
          const a = entries[i];
          const b = entries[j];
          let dx = ((b.position.x - a.position.x) / 100) * mapRect.width;
          let dy = ((b.position.y - a.position.y) / 100) * mapRect.height;
          let distance = Math.hypot(dx, dy);
          const minimum = Math.min(a.radiusPx, b.radiusPx) * 1.05 + 6;

          if (distance >= minimum) continue;
          if (distance < 0.01) {
            dx = 1;
            dy = 0;
            distance = 1;
          }

          const push = (minimum - distance) / distance;
          const aShare = a.locked ? 0 : b.locked ? 1 : 0.5;
          const bShare = b.locked ? 0 : a.locked ? 1 : 0.5;

          a.position = boundedPosition(
            a.position.x - ((dx * push * aShare) / mapRect.width) * 100,
            a.position.y - ((dy * push * aShare) / mapRect.height) * 100,
            a.bounds
          );
          b.position = boundedPosition(
            b.position.x + ((dx * push * bShare) / mapRect.width) * 100,
            b.position.y + ((dy * push * bShare) / mapRect.height) * 100,
            b.bounds
          );
        }
      }
    }

    return entries;
  }

  function updateNodePositions(time = performance.now()) {
    const entries = separateEntries(
      Array.from(nodeLayer.querySelectorAll(".conceptNode"))
        .map(nodeElement => collisionEntry(nodeElement, time))
        .filter(Boolean)
    );

    displayedPositions = new Map();
    entries.forEach(entry => {
      displayedPositions.set(entry.id, entry.position);
      entry.element.style.setProperty("--x", entry.position.x);
      entry.element.style.setProperty("--y", entry.position.y);
    });
  }

  function animate(time) {
    updateNodePositions(time);
    renderLines(time);
    window.requestAnimationFrame(animate);
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function render() {
    renderNodes();
    renderLines(performance.now());
    renderInspector();
    renderStanding();
  }

  resetButton?.addEventListener("click", () => {
    completed = new Set();
    saveCompleted();
    render();
  });

  window.addEventListener("pointermove", movePointerDrag);
  window.addEventListener("pointerup", endPointerDrag);
  window.addEventListener("pointercancel", cancelPointerDrag);

  render();
  window.requestAnimationFrame(animate);
})();
