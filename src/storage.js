import fs from 'node:fs';
import path from 'node:path';

export function createStorage(filePath) {
  const resolved = path.resolve(filePath);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  const initial = {
    attempts: [],
    events: [],
    assignments: [],
    sourceTexts: [],
    draftTasks: [],
    settings: { schoolName: 'Сауат', syncEnabled: false }
  };
  function normalize(value) {
    const next = value && typeof value === 'object' ? value : {};
    return {
      ...structuredClone(initial),
      ...next,
      attempts: Array.isArray(next.attempts) ? next.attempts : [],
      events: Array.isArray(next.events) ? next.events : [],
      assignments: Array.isArray(next.assignments) ? next.assignments : [],
      sourceTexts: Array.isArray(next.sourceTexts) ? next.sourceTexts : [],
      draftTasks: Array.isArray(next.draftTasks) ? next.draftTasks : [],
      settings: next.settings && typeof next.settings === 'object' ? next.settings : structuredClone(initial.settings)
    };
  }
  function read() {
    if (!fs.existsSync(resolved)) return structuredClone(initial);
    return normalize(JSON.parse(fs.readFileSync(resolved, 'utf8')));
  }
  function write(value) {
    const temp = `${resolved}.tmp`;
    fs.writeFileSync(temp, JSON.stringify(normalize(value), null, 2), 'utf8');
    fs.renameSync(temp, resolved);
  }
  function update(mutator) {
    const value = read();
    const result = mutator(value) || value;
    write(result);
    return result;
  }
  return { path: resolved, read, write, update, initial: () => structuredClone(initial) };
}
