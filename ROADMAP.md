# Roadmap

Audit of IntroToXen against [PROJECT_GUIDE.md](PROJECT_GUIDE.md), 2026-11-11 (main at 171cdda). The MVP loop (phases 2 to 6) works for the JI lesson. Most remaining work is breadth: real videos, labs and tasks for the other lessons, moving the Library and Practice Room onto the shared core, and folding in the prototypes and other repos.

## Phase status

| Phase | Status | Evidence |
| --- | --- | --- |
| 1 Audit | Done | This file |
| 2 Math and data foundation | Done for the MVP | `shared/xen/` (tuning, scale, project, transport, store, handoff, progress) over the bundled `shared/xen-tune-core.browser.js`; 35 tests pass |
| 3 Audio engine | Working, not yet consolidated | `audio/synth.js` (XenAudio: arbitrary-frequency tones, drones, voices, offline WAV render), `shared/xen/transport.js` scheduling, `shared/xen/audio-adapter.js`; 27 tests pass |
| 4 Minimal workstation (now the Studio) | Done | `studio/`: scale builder with presets, .scl/.kbm export, piano roll (drone, chords, melody), tempo, undo/redo, saved projects, .xenproj.json export/import, WAV render |
| 5 Classroom integration | Done for JI | JI lab hands off to Studio task views (`lesson-handoff`), exercises tick, lesson completes when all tasks are done |
| 6 End-to-end check | Done per commit f7338c9; not re-run in this audit | `tests/browser-flow.mjs` (manual, needs Playwright) |
| 7 Expansion | Not started | |

## What needs to be done

### Classroom

- [x] Replace the 9-node map in `map.js` with the 21-concept MVP map.
- [ ] Move the map's nodes and links out of `map.js` into data (`curriculum.json`).
- [x] Every MVP concept has a lesson file built on the JI lesson's shape; the 12 new ones (pitch, notes, intervals, chords, scales, harmonies, melodies, otonal/utonal, commas, NEJI, RTT, well-temperament) were added with placeholders.
- [ ] Replace placeholders with real videos and labs: every lesson except JI uses `animations/placeholder.html` or `applets/placeholder.html` somewhere (harmonic series keeps its own video and lab, subharmonic series its own lab).
- [ ] Write each lesson's real composition task; today every lesson except JI has a placeholder task (write one note, save).
- [ ] Move the lesson format to the five stages: animation becomes video, exercises become the composition stage, Q&A becomes confirmation, and a completion slide is added (links to the map, Studio, Xen Wiki and Library). Old lesson files must keep loading.
- [ ] Generalise the JI lab's one-off `lesson-handoff` message into `shared/lab-bridge.js` (`ready`, `progress`, `complete`).

### Storage

- [ ] Add a whole-session export/import (map progress, task progress, saved scales and projects). Today only single projects export (.xenproj.json).

### Library

- [x] The fifteen-limit atlas is the Library MVP at `library/index.html`, linked from the map.
- [ ] Move it onto the shared core.

### Practice Room

- [x] The odd-limit ear trainer (copied from NickVuci/OddLimitEarTrainer at 95695ee) is the Practice Room MVP at `practice/index.html`, linked from the map.
- [ ] Move it onto the shared core, and decide whether the separate repo and site are retired or kept in sync.

### Studio

- [x] The workstation is renamed the Studio (`studio/`), linked from the map; `workstation/` redirects. Storage keys keep the `nv:workstation:` prefix so saved work survives.

### Audio

- [ ] Move `audio/synth.js` from a global script into `shared/` as a module behind the existing adapter.

### Consolidation

- [ ] Classify the 9 remaining prototypes in `applets/prototypes/` (none use the shared core yet) as reuse, refactor, wrap, replace or retire. `xenharmonic-workbench-copy.html` is an older duplicate.
- [ ] Bring in xen-tun-core's source or record exactly how the bundle is built (only the built file is here; it is named `xen-tune-core`).
- [ ] Fold in TemperamentExplorer, OddLimitEarTrainer and the Directory site layout.
- [ ] Tidy the root: `animationSample.html` and `harmonic-series.html`.

### Docs

- [ ] Add AGENTS.md (test commands, conventions) and ARCHITECTURE.md (modules and data formats: xen-project v1, xen-handoff v1, storage keys).

## Suggested order

1. Concept map nodes and links as data.
2. Five-stage lesson format and the lab bridge, proven on the JI lesson.
3. Whole-session export/import.
4. Library and Practice Room onto the shared core.
5. Remaining lessons, then the Practice Room and the other repos.

## Testing

`node --test tests/*.test.*` runs 7 test files, 62 tests, all passing on Node 22. `tests/browser-flow.mjs` is a manual Playwright walk through the JI lesson.
