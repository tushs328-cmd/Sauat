import fs from 'node:fs';
import path from 'node:path';

export function createStorage(filePath) {
  const resolved = path.resolve(filePath);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  const initial = {
    attempts: [],
    assignments: [],
    sourceTexts: [],
    draftTasks: [],
    settings: { schoolName: 'Сауат', syncEnabled: false }
  };
  function read() {
    if (!fs.existsSync(resolved)) return structuredClone(initial);
    return JSON.parse(fs.readFileSync(resolved, 'utf8'));
  }
  function write(value) {
    const temp = `${resolved}.tmp`;
    fs.writeFileSync(temp, JSON.stringify(value, null, 2), 'utf8');
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
