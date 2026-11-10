// Lesson progress. One place that knows the storage keys.
//   intro-to-xen-map-progress      array of completed concept ids (the Concept Map's existing key)
//   nv:progress:tasks:<lessonId>   { [taskId]: { done, projectId, at } }
const MAP_KEY = 'intro-to-xen-map-progress';
const tasksKey = lessonId => `nv:progress:tasks:${lessonId}`;
const browserStorage = () => { try { return globalThis.localStorage ?? null; } catch { return null; } };

export function createProgress(storage = browserStorage()) {
  const readJson = (k, fallback) => { try { const v = JSON.parse(storage?.getItem(k) ?? 'null'); return v ?? fallback; } catch { return fallback; } };
  const writeJson = (k, v) => { try { if (!storage) return false; storage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } };
  const completed = () => { const list = readJson(MAP_KEY, []); return Array.isArray(list) ? list.filter(id => typeof id === 'string') : []; };

  return {
    completed,
    isComplete: lessonId => completed().includes(lessonId),
    complete(lessonId) { const list = completed(); return list.includes(lessonId) ? true : writeJson(MAP_KEY, [...list, lessonId]); },
    uncomplete(lessonId) { return writeJson(MAP_KEY, completed().filter(id => id !== lessonId)); },
    tasks(lessonId) { const record = readJson(tasksKey(lessonId), {}); return record && typeof record === 'object' && !Array.isArray(record) ? record : {}; },
    setTask(lessonId, taskId, entry) { return writeJson(tasksKey(lessonId), { ...this.tasks(lessonId), [taskId]: entry }); },
    /** True when every listed task id is recorded as done. An empty list is never "all done". */
    allDone(lessonId, taskIds) { const record = this.tasks(lessonId); return taskIds.length > 0 && taskIds.every(id => record[id]?.done === true); },
  };
}
