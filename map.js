(() => {
  const STORAGE_KEY = "intro-to-xen-map-progress";
  const nodes = [
    {
      id: "sound",
      title: "1. Sound Foundations",
      x: 50,
      y: 15,
      topics: ["Frequency", "Pitch", "Interval", "Tuning", "Octave / Period"]
    },
    {
      id: "ratio",
      title: "2. Ratio Foundations",
      x: 78,
      y: 30,
      topics: ["Interval as ratio", "Harmonic Series", "Just Intonation", "Commas"],
      lesson: "template.html?lesson=lessons/example.json"
    },
    {
      id: "equal",
      title: "3. Equal Division Path",
      x: 82,
      y: 54,
      topics: ["Period", "EDO / EDx", "12-EDO", "19-EDO", "Approximation"]
    },
    {
      id: "temperament",
      title: "4. Temperament Path",
      x: 72,
      y: 78,
      topics: ["Commas", "Tempering", "Temperament", "Mapping"]
    },
    {
      id: "generated",
      title: "5. Generated Scale Path",
      x: 43,
      y: 84,
      topics: ["Period", "Generator", "Stacking", "MOS scale"]
    },
    {
      id: "geometry",
      title: "6. Lattice / Geometry Path",
      x: 21,
      y: 48,
      topics: ["Prime dimensions", "JI lattice", "Tonality diamond", "Temperament geometry"]
    },
    {
      id: "application",
      title: "7. Musical Application",
      x: 20,
      y: 72,
      topics: ["Listening", "Singing / playing", "Composition", "Tools"]
    }
  ];

  const links = [
    { from: "sound", to: "ratio", type: "required" },
    { from: "ratio", to: "equal", type: "required" },
    { from: "ratio", to: "temperament", type: "required" },
    { from: "ratio", to: "generated", type: "required" },
    { from: "ratio", to: "geometry", type: "required" },
    { from: "equal", to: "application", type: "required" },
    { from: "temperament", to: "application", type: "required" },
    { from: "generated", to: "application", type: "required" },
    { from: "geometry", to: "application", type: "required" },
    { from: "equal", to: "temperament", type: "related" },
    { from: "temperament", to: "generated", type: "related" },
    { from: "generated", to: "geometry", type: "related" },
    { from: "geometry", to: "equal", type: "related" }
  ];

  const nodeById = new Map(nodes.map(node => [node.id, node]));
  const lineLayer = document.querySelector(".mapLines");
  const nodeLayer = document.querySelector(".conceptNodes");
  const resetButton = document.querySelector(".mapResetButton");
  const coreNode = document.querySelector(".coreNode");

  let selectedId = "sound";
  let completed = readCompleted();

  function readCompleted() {
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
      return new Set(Array.isArray(stored) ? stored : []);
    } catch {
      return new Set();
    }
  }

  function saveCompleted() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(completed)));
  }

  function svgPoint(node) {
    return { x: node.x * 10, y: node.y * 6.4 };
  }

  function isConnected(link) {
    return link.from === selectedId || link.to === selectedId;
  }

  function renderLines() {
    const namespace = "http://www.w3.org/2000/svg";
    lineLayer.replaceChildren();

    links.forEach(link => {
      const from = nodeById.get(link.from);
      const to = nodeById.get(link.to);
      if (!from || !to) return;
      const start = svgPoint(from);
      const end = svgPoint(to);
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
      const card = document.createElement("article");
      card.className = "conceptNode";
      card.classList.toggle("selected", node.id === selectedId);
      card.classList.toggle("complete", completed.has(node.id));
      card.style.setProperty("--x", node.x);
      card.style.setProperty("--y", node.y);
      card.tabIndex = 0;

      const status = document.createElement("span");
      status.className = "conceptStatus";
      status.textContent = completed.has(node.id) ? "Complete" : "Open";

      const title = document.createElement("h2");
      title.textContent = node.title;

      const topics = document.createElement("ul");
      topics.className = "conceptTopicList";
      node.topics.forEach(topic => {
        const item = document.createElement("li");
        item.textContent = topic;
        topics.appendChild(item);
      });

      const actions = document.createElement("div");
      actions.className = "conceptActions";

      const complete = document.createElement("button");
      complete.type = "button";
      complete.className = "conceptCompleteButton";
      complete.textContent = completed.has(node.id) ? "Undo" : "Done";
      complete.addEventListener("click", event => {
        event.stopPropagation();
        toggleComplete(node.id);
      });
      actions.appendChild(complete);

      if (node.lesson) {
        const lesson = document.createElement("a");
        lesson.className = "conceptLessonLink";
        lesson.href = node.lesson;
        lesson.textContent = "Lesson";
        actions.appendChild(lesson);
      }

      card.addEventListener("click", () => selectNode(node.id));
      card.addEventListener("keydown", event => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        selectNode(node.id);
      });

      card.append(status, title, topics, actions);
      nodeLayer.appendChild(card);
    });
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
    renderLines();
    renderNodes();
  }

  resetButton?.addEventListener("click", () => {
    completed = new Set();
    saveCompleted();
    render();
  });

  coreNode?.addEventListener("click", () => selectNode("sound"));

  render();
})();
