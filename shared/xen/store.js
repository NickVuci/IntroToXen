// Project persistence. localStorage by default; any object with getItem/setItem/removeItem works
// (tests pass a Map-backed one). Every call survives blocked or full storage and says so.
import { parseProject, serializeProject } from './project.js';
import { validateScale } from './scale.js';

const INDEX = 'nv:workstation:index';
const key = id => `nv:workstation:project:${id}`;
const SCALES = 'nv:workstation:scales';
const browserStorage = () => { try { return globalThis.localStorage ?? null; } catch { return null; } };

export function createStore(storage = browserStorage()) {
  const read = k => { try { return storage ? storage.getItem(k) : null; } catch { return null; } };
  const write = (k, v) => { try { if (!storage) return false; storage.setItem(k, v); return true; } catch { return false; } };
  const readIndex = () => { try { const list = JSON.parse(read(INDEX) || '[]'); return Array.isArray(list) ? list : []; } catch { return []; } };

  return {
    available: () => Boolean(storage),
    /** Saved projects, newest first: [{ id, name, updatedAt, noteCount, lessonId?, taskId? }] */
    list: () => readIndex().sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0)),
    load(id) {
      const text = read(key(id));
      return text ? parseProject(text) : null;
    },
    /** Returns true when the project was written. */
    save(project) {
      if (!write(key(project.id), serializeProject(project))) return false;
      const entry = { id: project.id, name: project.name, updatedAt: project.updatedAt, noteCount: project.notes.length };
      if (project.origin?.lessonId) { entry.lessonId = project.origin.lessonId; entry.taskId = project.origin.taskId; }
      return write(INDEX, JSON.stringify([entry, ...readIndex().filter(item => item.id !== project.id)]));
    },
    remove(id) {
      try { storage?.removeItem(key(id)); } catch { /* nothing to remove */ }
      return write(INDEX, JSON.stringify(readIndex().filter(item => item.id !== id)));
    },
    // ----- saved scales: one small list, newest first -----
    listScales() {
      try {
        const list = JSON.parse(read(SCALES) || '[]');
        return (Array.isArray(list) ? list : []).filter(item => { try { validateScale(item); return true; } catch { return false; } });
      } catch { return []; }
    },
    loadScale(id) { return this.listScales().find(item => item.id === id) ?? null; },
    /** Returns true when the scale was written. Saving under an existing id replaces it. */
    saveScale(scale) {
      validateScale(scale);
      return write(SCALES, JSON.stringify([scale, ...this.listScales().filter(item => item.id !== scale.id)]));
    },
    removeScale(id) { return write(SCALES, JSON.stringify(this.listScales().filter(item => item.id !== id))); },
    /** A project id that is not in use. `seed` (a time, say) keeps this module free of clocks and randomness. */
    newId(seed) {
      const taken = new Set([...readIndex(), ...this.listScales()].map(item => item.id));
      let n = 0, id;
      do { id = `p${seed}${n ? `-${n}` : ''}`; n += 1; } while (taken.has(id));
      return id;
    },
  };
}

/** Text of a project file for download (.xenproj.json). */
export const exportText = project => serializeProject(project);
/** A project from file text. Throws with a plain-language reason when the file is not usable. */
export const importText = text => parseProject(text);
export const fileName = project => `${project.name.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-') || 'project'}.xenproj.json`;
