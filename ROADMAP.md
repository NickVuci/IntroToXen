# Roadmap

Audit of IntroToXen against [PROJECT_GUIDE.md](PROJECT_GUIDE.md), 2026-11-11 (main at 171cdda). The MVP loop (phases 2 to 6) works for the JI lesson. Most remaining work is breadth: the new concept map, the other lessons, the Reference Library, the Practice Room, and folding in the prototypes and other repos.

## Phase status

| Phase | Status | Evidence |
| --- | --- | --- |
| 1 Audit | Done | This file |
| 2 Math and data foundation | Done for the MVP | `shared/xen/` (tuning, scale, project, transport, store, handoff, progress) over the bundled `shared/xen-tune-core.browser.js`; 35 tests pass |
| 3 Audio engine | Working, not yet consolidated | `audio/synth.js` (XenAudio: arbitrary-frequency tones, drones, voices, offline WAV render), `shared/xen/transport.js` scheduling, `shared/xen/audio-adapter.js`; 27 tests pass |
| 4 Minimal workstation | Done | `workstation/`: scale builder with presets, .scl/.kbm export, piano roll (drone, chords, melody), tempo, undo/redo, saved projects, .xenproj.json export/import, WAV render |
| 5 Classroom integration | Done for JI | JI lab hands off to workstation task views (`lesson-handoff`), exercises tick, lesson completes when all tasks are done |
| 6 End-to-end check | Done per commit f7338c9; not re-run in this audit | `tests/browser-flow.mjs` (manual, needs Playwright) |
| 7 Expansion | Not started | |

## What needs to be done

### Classroom

- [ ] Replace the 9-node map in `map.js` with the 21-concept MVP map, as data (`curriculum.json`) rather than hard-coded nodes and links.
- [ ] Map the 10 existing lesson files onto MVP concepts; 12 concepts have no lesson yet (pitch, notes, intervals, chords, scales, harmonies, melodies, otonal/utonal, commas, NEJI, RTT, well-temperament).
- [ ] Six lessons are placeholders: equal-tuning, period, generated-collection, moments-of-symmetry, temperaments and tonality-diamond have no lab and use `animations/example.html`.
- [ ] Move the lesson format to the five stages: animation becomes video, exercises become the composition stage, Q&A becomes confirmation, and a completion slide is added (links to the map, workstation, Xen Wiki and Reference Library). Old lesson files must keep loading.
- [ ] Generalise the JI lab's one-off `lesson-handoff` message into `shared/lab-bridge.js` (`ready`, `progress`, `complete`).

### Storage

- [ ] Add a whole-session export/import (map progress, task progress, saved scales and projects). Today only single projects export (.xenproj.json).

### Reference Library

- [ ] Build the MVP core from `applets/prototypes/fifteen-limit-atlas.html` (all features kept), moved onto the shared core.

### Practice Room

- [ ] Create it, starting with the odd-limit ear trainer (separate repo, NickVuci/OddLimitEarTrainer) on the shared core; `ear-trainer-classic.html` here is a feature reference.

### Audio

- [ ] Move `audio/synth.js` from a global script into `shared/` as a module behind the existing adapter.

### Consolidation

- [ ] Classify the 10 prototypes in `applets/prototypes/` (none use the shared core yet) as reuse, refactor, wrap, replace or retire. `xenharmonic-workbench-copy.html` is an older duplicate.
- [ ] Bring in xen-tun-core's source or record exactly how the bundle is built (only the built file is here; it is named `xen-tune-core`).
- [ ] Fold in TemperamentExplorer, OddLimitEarTrainer and the Directory site layout.
- [ ] Tidy the root: `animationSample.html`, `harmonic-series.html` and the old `conceptMap.md`.

### Docs

- [ ] Add AGENTS.md (test commands, conventions) and ARCHITECTURE.md (modules and data formats: xen-project v1, xen-handoff v1, storage keys).

## Suggested order

1. Concept map as data with the 21 MVP concepts, linked to the lessons that exist.
2. Five-stage lesson format and the lab bridge, proven on the JI lesson.
3. Whole-session export/import.
4. Reference Library core from the atlas.
5. Remaining lessons, then the Practice Room and the other repos.

## Testing

`node --test tests/` runs 7 test files, 62 tests, all passing on Node 22. `tests/browser-flow.mjs` is a manual Playwright walk through the JI lesson.
