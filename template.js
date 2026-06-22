(() => {
  const SECTION_ORDER = ["title", "animation", "lab", "exercises", "qa"];
  const DEFAULT_LESSON_PATH = "lessons/example.json";
  const SVG_NS = "http://www.w3.org/2000/svg";
  const shell = document.getElementById("lessonShell");
  const backArrow = document.getElementById("backArrowTop");
  const dotsNav = document.querySelector(".bottomDots");
  const defaults = {
    title: {
      label: "Title",
      heading: "Untitled lesson",
      body: "",
      startButton: "Start",
      prerequisites: [],
      relatedConcepts: []
    },
    animation: {
      enabled: true,
      label: "Animation",
      file: "",
      word: "",
      durationMs: 7800,
      startButton: "Start",
      nextButton: "Next"
    },
    lab: {
      enabled: true,
      label: "Lab",
      file: "",
      prompt: "",
      ariaLabel: "Interactive lab"
    },
    qa: {
      enabled: true,
      label: "Q&A",
      questionTitle: "Question",
      question: "",
      answerTitle: "Answer",
      answer: "",
      choices: []
    },
    exercises: {
      enabled: true,
      label: "Exercises",
      items: []
    }
  };

  let sections = [];
  let navDots = [];
  let current = 0;
  let locked = false;
  let touchStartY = 0;
  let touchStartX = 0;
  let animationRaf = null;
  let animationStart = 0;
  let animationProgress = 0;
  let animationMuted = false;
  let animationControls = null;

  function asText(value, fallback = "") {
    if (value === undefined || value === null) return fallback;
    return String(value);
  }

  function asPositiveNumber(value, fallback) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }

  function el(tagName, className, textValue) {
    const node = document.createElement(tagName);
    if (className) node.className = className;
    if (textValue !== undefined) node.textContent = asText(textValue);
    return node;
  }

  function appendText(parent, tagName, textValue, className) {
    const node = el(tagName, className, textValue);
    parent.appendChild(node);
    return node;
  }

  function button(label, className) {
    const node = el("button", className, label);
    node.type = "button";
    return node;
  }

  function icon(className, pathData) {
    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("class", className);
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    const path = document.createElementNS(SVG_NS, "path");
    path.setAttribute("d", pathData);
    svg.appendChild(path);
    return svg;
  }

  function section(type, label, content) {
    const node = el("section", "sectionLayer");
    node.dataset.section = asText(label);
    node.dataset.sectionType = type;
    node.appendChild(content);
    return node;
  }

  function header(label) {
    const node = el("div", "sectionHeader");
    appendText(node, "div", label, "eyebrow sectionLabel");
    return node;
  }

  function stage(content) {
    const node = el("div", "stage");
    const box = el("div", "placeholderBox");
    const controls = el("div", "controls");
    controls.setAttribute("aria-hidden", "true");
    box.appendChild(content);
    node.append(box, controls);
    return node;
  }

  function emptyNote() {
    const node = el("div", "note emptyNote");
    node.setAttribute("aria-hidden", "true");
    return node;
  }

  function renderTitle(config) {
    const card = el("div", "heroCard");
    const titleHeader = el("div", "titleHeader");
    if (config.showLabel !== false) appendText(titleHeader, "div", config.label, "eyebrow sectionLabel");
    appendText(titleHeader, "h1", config.heading);
    if (config.body) appendText(titleHeader, "p", config.body);

    const titleBody = el("div", "titleBody");
    const groups = [
      { title: "Prerequisites", items: Array.isArray(config.prerequisites) ? config.prerequisites : [] },
      { title: "Related Concepts", items: Array.isArray(config.relatedConcepts) ? config.relatedConcepts : [] }
    ].filter(group => group.items.length);

    if (!groups.length) {
      titleBody.setAttribute("aria-hidden", "true");
    } else {
      card.classList.add("hasTitleResources");
      const resourceGrid = el("div", "titleResourceGrid");

      groups.forEach(group => {
        const panel = el("section", "titleResourcePanel");
        appendText(panel, "h2", group.title, "titleResourceHeading");
        const list = el("div", "titleResourceList");

        group.items.forEach(item => {
          const href = asText(item?.href);
          if (!href) return;
          const link = el("a", "titleResourceLink");
          link.href = href;
          appendText(link, "strong", item?.label || href, "titleResourceLabel");
          if (item?.body) appendText(link, "span", item.body, "titleResourceBody");
          list.appendChild(link);
        });

        if (list.childElementCount) {
          panel.appendChild(list);
          resourceGrid.appendChild(panel);
        }
      });

      if (resourceGrid.childElementCount) {
        titleBody.appendChild(resourceGrid);
      } else {
        titleBody.setAttribute("aria-hidden", "true");
        card.classList.remove("hasTitleResources");
      }
    }

    const spacer = el("div", "note spacerNote");
    spacer.setAttribute("aria-hidden", "true");
    const actions = el("div", "heroActions");
    actions.appendChild(button(config.startButton, "primary startLessonButton"));
    card.append(titleHeader, titleBody, spacer, actions);
    return section("title", config.label, card);
  }

  function renderAnimation(config) {
    const inner = el("div", "sectionInner");
    const anim = el("div", "animationStage");
    anim.dataset.durationMs = String(asPositiveNumber(config.durationMs, defaults.animation.durationMs));
    if (config.file) {
      const frame = el("iframe", "animationFrame");
      frame.src = asText(config.file);
      frame.title = asText(config.label, defaults.animation.label);
      frame.loading = "eager";
      frame.allow = "autoplay";
      anim.appendChild(frame);
    } else {
      appendText(anim, "div", config.word, "animationWord");
    }

    const overlay = el("div", "animationOverlay");
    overlay.append(
      button(config.startButton, "primary startAnimationButton"),
      button(config.nextButton, "primary hidden animationNextButton")
    );
    anim.appendChild(overlay);

    const timelinePanel = el("div", "timelinePanel");
    const timeline = el("input", "animationTimeline");
    timeline.type = "range";
    timeline.min = "0";
    timeline.max = "1000";
    timeline.value = "0";
    timeline.step = "1";
    timeline.setAttribute("aria-label", "Animation timeline");

    const timelineControls = el("div", "timelineControls");
    timelineControls.setAttribute("aria-label", "Animation media controls");
    const playPause = el("button", "mediaButton playPauseButton");
    playPause.type = "button";
    playPause.setAttribute("aria-label", "Play animation");
    playPause.append(
      icon("playIcon", "M8 5v14l11-7z"),
      icon("pauseIcon", "M7 5h4v14H7zM13 5h4v14h-4z")
    );
    const sound = el("button", "mediaButton soundButton");
    sound.type = "button";
    sound.setAttribute("aria-label", "Mute animation audio");
    sound.append(
      icon("soundIcon", "M4 9v6h4l5 4V5L8 9H4zm12.5 3a4.5 4.5 0 0 0-2.2-3.87v7.74A4.5 4.5 0 0 0 16.5 12zm-2.2-8.25v2.06a7 7 0 0 1 0 12.38v2.06a9 9 0 0 0 0-16.5z"),
      icon("mutedIcon", "M4 9v6h4l5 4V5L8 9H4zm13.59 3L20 9.59 18.41 8 16 10.41 13.59 8 12 9.59 14.41 12 12 14.41 13.59 16 16 13.59 18.41 16 20 14.41z")
    );
    timelineControls.append(playPause, sound);
    timelinePanel.append(timeline, timelineControls);
    inner.append(header(config.label), stage(anim), timelinePanel);
    return section("animation", config.label, inner);
  }

  function renderLab(config) {
    const inner = el("div", "sectionInner");
    let content;
    if (config.file) {
      const frame = el("iframe", "appletFrame embedFrame");
      frame.src = asText(config.file);
      frame.title = asText(config.label, defaults.lab.label);
      frame.loading = "eager";
      frame.allow = "autoplay";
      content = frame;
    } else {
      const surface = el("div", "labSurface");
      surface.setAttribute("role", "button");
      surface.tabIndex = 0;
      surface.setAttribute("aria-label", asText(config.ariaLabel, defaults.lab.ariaLabel));
      appendText(surface, "span", config.prompt);
      content = surface;
    }
    inner.append(header(config.label), stage(content), emptyNote());
    return section("lab", config.label, inner);
  }

  function renderQa(config) {
    const inner = el("div", "sectionInner");
    const box = el("div", "qaBox");
    const prompt = el("div", "qaPrompt");
    appendText(prompt, "div", config.label, "eyebrow qaSectionEyebrow");
    appendText(prompt, "div", config.questionTitle, "qaQuestionLabel");
    appendText(prompt, "h2", config.question, "qaQuestionText");
    if (config.hint) appendText(prompt, "p", config.hint, "qaHint");
    const choices = Array.isArray(config.choices) ? config.choices : [];
    const correctIndex = Number.isInteger(config.correctIndex) ? config.correctIndex : -1;

    if (choices.length) {
      const choiceList = el("div", "qaChoices");
      choiceList.setAttribute("role", "list");
      choices.forEach((choice, index) => {
        const choiceText = typeof choice === "string" ? choice : choice?.text;
        const choiceButton = button(choiceText ?? `Choice ${index + 1}`, "qaChoice");
        choiceButton.dataset.correct = String(Boolean(choice?.correct) || index === correctIndex);
        choiceButton.setAttribute("aria-pressed", "false");
        choiceList.appendChild(choiceButton);
      });
      box.append(prompt, choiceList);
    } else {
      const answer = el("div", "qaAnswer");
      appendText(answer, "strong", config.answerTitle);
      appendText(answer, "p", config.answer);
      const reveal = button("Show answer", "showAnswerButton");
      box.append(prompt, reveal, answer);
    }

    inner.append(header(config.label), stage(box), emptyNote());
    return section("qa", config.label, inner);
  }

  function renderExercises(config) {
    const inner = el("div", "sectionInner");
    const checklist = el("div", "exerciseChecklist");
    const items = Array.isArray(config.items) && config.items.length ? config.items : defaults.exercises.items;
    items.forEach((item, index) => {
      const row = el("label", "exerciseItem");
      const checkbox = el("input");
      checkbox.type = "checkbox";
      checkbox.setAttribute("aria-label", asText(item?.title, `Exercise ${index + 1}`));
      const text = el("span", "exerciseText");
      appendText(text, "strong", item?.title ?? `Exercise ${index + 1}`);
      appendText(text, "p", item?.body ?? "");
      row.append(checkbox, text);
      checklist.appendChild(row);
    });
    inner.append(header(config.label), stage(checklist), emptyNote());
    return section("exercises", config.label, inner);
  }

  const renderers = {
    title: renderTitle,
    animation: renderAnimation,
    lab: renderLab,
    qa: renderQa,
    exercises: renderExercises
  };

  function lessonPath() {
    const params = new URLSearchParams(window.location.search);
    return params.get("lesson") || document.body.dataset.lesson || DEFAULT_LESSON_PATH;
  }

  function showMessage(title, body) {
    shell.replaceChildren();
    dotsNav.replaceChildren();
    dotsNav.hidden = true;
    const card = el("div", "heroCard");
    const titleHeader = el("div", "titleHeader");
    appendText(titleHeader, "div", title, "eyebrow sectionLabel");
    appendText(titleHeader, "h1", title);
    appendText(titleHeader, "p", body);
    card.appendChild(titleHeader);
    const messageSection = section("title", title, card);
    messageSection.classList.add("active");
    shell.appendChild(messageSection);
  }

  function enabledSections(lesson) {
    const sourceSections = lesson.sections && typeof lesson.sections === "object" ? lesson.sections : defaults;
    return SECTION_ORDER
      .filter(type => sourceSections[type] && sourceSections[type].enabled !== false)
      .map(type => ({ type, config: { ...defaults[type], ...sourceSections[type] } }));
  }

  function renderLesson(lesson) {
    const visible = enabledSections(lesson);
    if (!visible.length) throw new Error("This lesson has no enabled sections.");

    document.title = asText(lesson.title, "Reusable Lesson Template");
    backArrow.href = asText(lesson.backHref, "../");
    shell.replaceChildren();
    dotsNav.replaceChildren();
    dotsNav.hidden = false;

    visible.forEach(({ type, config }, index) => {
      const rendered = renderers[type](config);
      if (index === 0) rendered.classList.add("active");
      shell.appendChild(rendered);

      const dot = button("", "dot");
      dot.setAttribute("aria-label", `Go to ${asText(config.label, type)}`);
      dotsNav.appendChild(dot);
    });
  }

  function animationOpacity(progress) {
    if (progress <= 0.34) return progress / 0.34;
    if (progress <= 0.66) return 1;
    return Math.max(0, (1 - progress) / 0.34);
  }

  function postAnimationMessage(type, detail = {}) {
    if (!animationControls?.frame?.contentWindow) return;
    animationControls.frame.contentWindow.postMessage({ type, ...detail }, window.location.origin);
  }

  function updateMediaControls() {
    if (!animationControls) return;
    const playing = animationControls.stage.classList.contains("running");
    animationControls.playPause.classList.toggle("playing", playing);
    animationControls.playPause.setAttribute("aria-label", playing ? "Pause animation" : "Play animation");
    animationControls.sound.classList.toggle("muted", animationMuted);
    animationControls.sound.setAttribute("aria-label", animationMuted ? "Unmute animation audio" : "Mute animation audio");
  }

  function setAnimationProgress(progress) {
    if (!animationControls) return;
    animationProgress = clamp(progress, 0, 1);
    animationControls.timeline.value = String(Math.round(animationProgress * 1000));
    animationControls.timeline.style.setProperty("--timeline-pct", `${animationProgress * 100}%`);
    if (animationControls.word) {
      animationControls.word.style.opacity = String(animationOpacity(animationProgress));
    }
    postAnimationMessage("lesson-animation-progress", { progress: animationProgress });

    if (animationProgress >= 1) {
      animationControls.stage.classList.remove("running");
      animationControls.stage.classList.add("finished");
      animationControls.next.classList.remove("hidden");
      postAnimationMessage("lesson-animation-finish");
    } else {
      animationControls.stage.classList.remove("finished");
      animationControls.next.classList.add("hidden");
    }
    updateMediaControls();
  }

  function stopAnimationPlayback() {
    if (animationRaf) window.cancelAnimationFrame(animationRaf);
    animationRaf = null;
    if (animationControls) animationControls.stage.classList.remove("running");
    postAnimationMessage("lesson-animation-pause");
    updateMediaControls();
  }

  function resetAnimationSection() {
    if (!animationControls) return;
    stopAnimationPlayback();
    animationControls.stage.classList.remove("finished");
    animationControls.start.classList.remove("hidden");
    animationControls.next.classList.add("hidden");
    setAnimationProgress(0);
    postAnimationMessage("lesson-animation-reset");
  }

  function activateSection(index) {
    if (sections[index]?.dataset.sectionType === "animation") {
      resetAnimationSection();
    }
  }

  function updateNavigation() {
    navDots.forEach((dot, index) => {
      const active = index === current;
      dot.classList.toggle("active", active);
      if (active) dot.setAttribute("aria-current", "true");
      else dot.removeAttribute("aria-current");
    });
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function goTo(index, allowDuringFade = false) {
    const next = clamp(index, 0, sections.length - 1);
    if (next === current) return;
    if (locked && !allowDuringFade) return;

    locked = true;
    const previous = current;
    current = next;

    sections.forEach((section, sectionIndex) => {
      if (sectionIndex !== previous && sectionIndex !== current) {
        section.classList.remove("active", "leaving");
      }
    });

    sections[previous].classList.remove("active");
    sections[previous].classList.add("leaving");
    sections[current].classList.add("active");
    sections[current].classList.remove("leaving");
    activateSection(current);
    updateNavigation();

    window.setTimeout(() => {
      sections[previous].classList.remove("leaving");
      locked = false;
    }, 1220);
  }

  function next(allowDuringFade = false) {
    goTo(current + 1, allowDuringFade);
  }

  function back(allowDuringFade = false) {
    goTo(current - 1, allowDuringFade);
  }

  function playAnimationFromCurrentPosition() {
    if (!animationControls) return;
    stopAnimationPlayback();
    animationControls.start.classList.add("hidden");
    animationControls.next.classList.add("hidden");
    animationControls.stage.classList.add("running");
    animationControls.stage.classList.remove("finished");
    postAnimationMessage("lesson-animation-play", { progress: animationProgress });
    updateMediaControls();
    animationStart = performance.now() - animationProgress * animationControls.durationMs;

    function frame(now) {
      const progress = (now - animationStart) / animationControls.durationMs;
      setAnimationProgress(progress);

      if (progress < 1) {
        animationRaf = window.requestAnimationFrame(frame);
        return;
      }

      animationRaf = null;
    }

    animationRaf = window.requestAnimationFrame(frame);
  }

  function toggleAnimationPlayback() {
    if (!animationControls) return;
    if (animationControls.stage.classList.contains("running")) {
      stopAnimationPlayback();
      return;
    }
    if (animationProgress >= 1) setAnimationProgress(0);
    playAnimationFromCurrentPosition();
  }

  window.addEventListener("wheel", event => {
    if (!sections.length) return;
    if (locked) return;
    if (Math.abs(event.deltaY) < 24) return;
    event.preventDefault();
    if (event.deltaY > 0) next();
    else back();
  }, { passive: false });

  window.addEventListener("keydown", event => {
    if (!sections.length) return;
    const tag = document.activeElement?.tagName?.toLowerCase();
    if (tag === "input" || tag === "textarea") return;

    if (["ArrowDown", "ArrowRight", "PageDown", " "].includes(event.key)) {
      event.preventDefault();
      next(true);
    }

    if (["ArrowUp", "ArrowLeft", "PageUp"].includes(event.key)) {
      event.preventDefault();
      back(true);
    }

    if (event.key === "Home") {
      event.preventDefault();
      goTo(0, true);
    }

    if (event.key === "End") {
      event.preventDefault();
      goTo(sections.length - 1, true);
    }
  });

  window.addEventListener("touchstart", event => {
    const touch = event.changedTouches[0];
    touchStartY = touch.clientY;
    touchStartX = touch.clientX;
  }, { passive: true });

  window.addEventListener("touchend", event => {
    if (!sections.length) return;
    const touch = event.changedTouches[0];
    const dy = touch.clientY - touchStartY;
    const dx = touch.clientX - touchStartX;
    if (Math.abs(dy) < 54 || Math.abs(dy) < Math.abs(dx)) return;
    if (dy < 0) next();
    else back();
  }, { passive: true });

  function addRipple(event, labSurface) {
    const rect = labSurface.getBoundingClientRect();
    const x = (event.clientX ?? rect.left + rect.width / 2) - rect.left;
    const y = (event.clientY ?? rect.top + rect.height / 2) - rect.top;
    const ripple = document.createElement("span");
    ripple.className = "ripple";
    ripple.style.left = `${x}px`;
    ripple.style.top = `${y}px`;
    labSurface.appendChild(ripple);
    window.setTimeout(() => ripple.remove(), 920);
  }

  function bindRenderedControls() {
    sections = Array.from(document.querySelectorAll(".sectionLayer"));
    navDots = Array.from(document.querySelectorAll(".bottomDots .dot"));
    current = 0;
    locked = false;
    animationControls = null;
    animationProgress = 0;
    animationMuted = false;

    navDots.forEach((dot, index) => {
      dot.addEventListener("click", () => goTo(index));
    });

    document.querySelector(".startLessonButton")?.addEventListener("click", next);

    const animationStage = document.querySelector(".animationStage");
    if (animationStage) {
      animationControls = {
        stage: animationStage,
        word: animationStage.querySelector(".animationWord"),
        frame: animationStage.querySelector(".animationFrame"),
        start: animationStage.querySelector(".startAnimationButton"),
        next: animationStage.querySelector(".animationNextButton"),
        timeline: document.querySelector(".animationTimeline"),
        playPause: document.querySelector(".playPauseButton"),
        sound: document.querySelector(".soundButton"),
        durationMs: asPositiveNumber(animationStage.dataset.durationMs, defaults.animation.durationMs)
      };
      animationControls.start?.addEventListener("click", playAnimationFromCurrentPosition);
      animationControls.next?.addEventListener("click", next);
      animationControls.playPause?.addEventListener("click", toggleAnimationPlayback);
      animationControls.sound?.addEventListener("click", () => {
        animationMuted = !animationMuted;
        updateMediaControls();
        postAnimationMessage("lesson-animation-mute", { muted: animationMuted });
      });
      animationControls.timeline?.addEventListener("input", () => {
        const progress = Number(animationControls.timeline.value) / 1000;
        setAnimationProgress(progress);
        if (animationControls.stage.classList.contains("running")) {
          animationStart = performance.now() - animationProgress * animationControls.durationMs;
        }
      });
      animationControls.timeline?.addEventListener("pointerdown", event => {
        animationControls.timeline.setPointerCapture?.(event.pointerId);
      });
      animationControls.frame?.addEventListener("load", () => {
        postAnimationMessage("lesson-animation-progress", { progress: animationProgress });
      });
      setAnimationProgress(0);
      updateMediaControls();
    }

    document.querySelectorAll(".labSurface").forEach(labSurface => {
      labSurface.addEventListener("pointerdown", event => addRipple(event, labSurface));
      labSurface.addEventListener("keydown", event => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        addRipple({ clientX: undefined, clientY: undefined }, labSurface);
      });
    });

    document.querySelectorAll(".showAnswerButton").forEach(showAnswerButton => {
      const answer = showAnswerButton.parentElement?.querySelector(".qaAnswer");
      showAnswerButton.addEventListener("click", () => {
        const visible = answer?.classList.toggle("visible");
        showAnswerButton.textContent = visible ? "Hide answer" : "Show answer";
        showAnswerButton.classList.toggle("active", Boolean(visible));
      });
    });

    document.querySelectorAll(".qaChoices").forEach(choiceList => {
      const choices = Array.from(choiceList.querySelectorAll(".qaChoice"));

      choices.forEach(choice => {
        choice.addEventListener("click", () => {
          const isCorrect = choice.dataset.correct === "true";
          choices.forEach(item => {
            item.classList.remove("selected", "correct", "incorrect");
            item.setAttribute("aria-pressed", "false");
          });
          choice.classList.add("selected", isCorrect ? "correct" : "incorrect");
          choice.setAttribute("aria-pressed", "true");
        });
      });
    });

    updateNavigation();
    activateSection(current);
  }

  async function init() {
    showMessage("Loading", "Loading lesson content...");
    try {
      const path = lessonPath();
      const response = await fetch(path, { cache: "no-store" });
      if (!response.ok) throw new Error(`Could not load ${path} (${response.status}).`);
      const lesson = await response.json();
      renderLesson(lesson);
      bindRenderedControls();
    } catch (error) {
      console.error(error);
      showMessage("Lesson error", error instanceof Error ? error.message : "The lesson could not be loaded.");
    }
  }

  init();
})();

