import express from 'express';
import multer from 'multer';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import { createStorage } from './storage.js';
import { clearSessions, getClassCodes, login, requireAuth } from './auth.js';
import { getTask, publicTask, taskBank, taskCounts } from './taskBank.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const defaultDataPath = process.env.SAULAT_DATA_FILE || path.join(root, 'data', 'saulat.json');

function today() { return new Date().toISOString().slice(0, 10); }
function safeString(value, max = 10000) { return String(value ?? '').trim().slice(0, max); }
function modeLabel() { return process.env.OLLAMA_URL ? 'ИИ (локальная Ollama, если доступна)' : 'Без ИИ (офлайн-банк)'; }

export function createApp({ dataPath = defaultDataPath } = {}) {
  const app = express();
  const storage = createStorage(dataPath);
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024 } });
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: false }));
  app.use(express.static(path.join(root, 'public')));

  app.get('/api/health', (req, res) => res.json({ ok: true, product: 'Сауат', mode: modeLabel(), taskCounts }));
  app.post('/api/auth/login', (req, res) => {
    try { return res.json({ user: login(req.body), mode: modeLabel() }); }
    catch (error) { return res.status(400).json({ error: error.message }); }
  });
  app.post('/api/auth/logout', requireAuth(), (req, res) => { clearSessions(); res.json({ ok: true }); });
  app.get('/api/me', requireAuth(), (req, res) => res.json({ user: req.user, mode: modeLabel() }));

  app.get('/api/tasks', requireAuth(), (req, res) => {
    const subject = req.query.subject && ['reading', 'math', 'mixed'].includes(req.query.subject) ? req.query.subject : null;
    const lang = req.query.lang && ['ru', 'kz'].includes(req.query.lang) ? req.query.lang : null;
    const limit = Math.min(Math.max(Number(req.query.limit) || 60, 1), 100);
    const tasks = taskBank.filter((task) => (!subject || task.subject === subject) && (!lang || task.lang === lang)).slice(0, limit).map(publicTask);
    res.json({ tasks, mode: modeLabel() });
  });

  app.get('/api/student/next-task', requireAuth('student'), (req, res) => {
    const state = storage.read();
    const requestedLang = ['ru', 'kz'].includes(req.query.lang) ? req.query.lang : null;
    const mine = state.attempts.filter((a) => a.studentKey === studentKey(req.user));
    const skills = ['find', 'infer', 'evaluate', 'math'];
    const stats = Object.fromEntries(skills.map((skill) => {
      const rows = mine.filter((a) => a.skill === skill).slice(-8);
      return [skill, rows.length ? rows.filter((a) => a.correct).length / rows.length : 0.5];
    }));
    const weakest = skills.sort((a, b) => stats[a] - stats[b])[0];
    const targetDifficulty = stats[weakest] < 0.5 ? 1 : stats[weakest] < 0.8 ? 2 : 3;
    const answered = new Set(mine.slice(-12).map((a) => a.taskId));
    const pool = requestedLang ? taskBank.filter((task) => task.lang === requestedLang) : taskBank;
    const candidate = pool.find((task) => task.skill === weakest && task.difficulty === targetDifficulty && !answered.has(task.id))
      || pool.find((task) => task.skill === weakest && !answered.has(task.id))
      || pool.find((task) => !answered.has(task.id)) || pool[0] || taskBank[0];
    res.json({ task: publicTask(candidate), recommendation: { skill: weakest, accuracy: stats[weakest], difficulty: targetDifficulty }, mode: modeLabel() });
  });

  app.post('/api/student/answer', requireAuth('student'), (req, res) => {
    const task = getTask(safeString(req.body.taskId, 100));
    if (!task) return res.status(404).json({ error: 'Задание не найдено' });
    const selected = Number(req.body.answer);
    const correct = Number.isInteger(selected) && selected === task.answer;
    const attempt = { id: `${Date.now()}-${Math.random().toString(16).slice(2)}`, studentKey: studentKey(req.user), studentName: req.user.name, classId: req.user.classId, taskId: task.id, skill: task.skill, subject: task.subject, lang: task.lang, difficulty: task.difficulty, selected, correct, createdAt: new Date().toISOString() };
    storage.update((state) => { state.attempts.push(attempt); return state; });
    res.json({ correct, skill: task.skill, quote: task.quote, feedback: correct ? 'Верно: вы нашли опору в источнике.' : 'Пока не совпало. Сверьте ответ с цитатой и попробуйте ещё раз.', explanation: correct ? task.explanation : null, mode: modeLabel() });
  });

  app.get('/api/student/progress', requireAuth('student'), (req, res) => {
    const mine = storage.read().attempts.filter((a) => a.studentKey === studentKey(req.user));
    res.json(progressFor(mine));
  });

  app.get('/api/student/assignments', requireAuth('student'), (req, res) => {
    const state = storage.read();
    res.json({ assignments: state.assignments.filter((a) => a.classId === req.user.classId && a.published).map((a) => ({ ...a, tasks: a.taskIds.map(getTask).filter(Boolean).map(publicTask) })) });
  });

  app.post('/api/student/mentor', requireAuth('student'), (req, res) => {
    const task = getTask(safeString(req.body.taskId, 100));
    const level = Math.min(Math.max(Number(req.body.level) || 1, 1), 3);
    const attempted = Boolean(req.body.attempted);
    if (!task) return res.status(404).json({ error: 'Задание не найдено' });
    if (level === 3 && !attempted) return res.json({ level, requiresAttempt: true, message: 'Сначала выберите свой ответ — после попытки разберём ход решения.', quote: task.quote });
    const content = level === 1 ? 'Посмотрите на предложение, где описан факт или число из вопроса.' : level === 2 ? 'Какое слово или число в вопросе нужно подтвердить прямо цитатой?' : `Разбор: сопоставьте вопрос с цитатой, затем объясните, почему один вариант лучше других. Опора: ${task.explanation}`;
    res.json({ level, message: content, quote: task.quote, readyAnswer: false });
  });

  app.post('/api/teacher/texts', requireAuth('teacher'), upload.single('file'), async (req, res) => {
    try {
      let text = safeString(req.body.text, 10000);
      let title = safeString(req.body.title, 120) || 'Новый материал';
      if (req.file) {
        title = title === 'Новый материал' ? req.file.originalname : title;
        if (req.file.mimetype === 'application/pdf' || req.file.originalname.toLowerCase().endsWith('.pdf')) {
          const pdfModule = await import('pdf-parse');
          const parsed = await pdfModule.default(req.file.buffer);
          text = safeString(parsed.text, 10000);
          if (!text) return res.status(400).json({ error: 'В PDF нет текстового слоя' });
        } else text = safeString(req.file.buffer.toString('utf8'), 10000);
      }
      if (text.length < 30) return res.status(400).json({ error: 'Добавьте текст не короче 30 символов' });
      const source = { id: `source-${Date.now()}`, title, text, createdAt: new Date().toISOString(), createdBy: req.user.name };
      storage.update((state) => { state.sourceTexts.push(source); return state; });
      res.json({ source, generated: generateTeacherTasks(source) });
    } catch (error) { res.status(400).json({ error: `Не удалось прочитать файл: ${error.message}` }); }
  });

  app.get('/api/teacher/overview', requireAuth('teacher'), (req, res) => {
    const state = storage.read();
    const attempts = state.attempts;
    const skills = ['find', 'infer', 'evaluate', 'math'];
    const skillMap = Object.fromEntries(skills.map((skill) => { const rows = attempts.filter((a) => a.skill === skill); return [skill, { attempts: rows.length, accuracy: percent(rows.filter((a) => a.correct).length, rows.length) }]; }));
    const hard = [...new Map(attempts.map((a) => [a.taskId, a])).values()].map((a) => { const rows = attempts.filter((x) => x.taskId === a.taskId); return { taskId: a.taskId, title: getTask(a.taskId)?.title || 'Авторское задание', accuracy: percent(rows.filter((x) => x.correct).length, rows.length), attempts: rows.length }; }).sort((a, b) => a.accuracy - b.accuracy).slice(0, 5);
    const students = [...new Map(attempts.map((a) => [a.studentKey, a.studentName])).entries()].map(([key, name]) => { const rows = attempts.filter((a) => a.studentKey === key); return { name, attempts: rows.length, accuracy: percent(rows.filter((a) => a.correct).length, rows.length), status: percent(rows.filter((a) => a.correct).length, rows.length) < 60 ? 'Нужна поддержка' : 'В движении' }; });
    res.json({ className: '7–9 классы', skillMap, hardQuestions: hard, students, weekly: weekly(attempts) });
  });

  app.post('/api/teacher/assignments', requireAuth('teacher'), (req, res) => {
    const taskIds = Array.isArray(req.body.taskIds) ? req.body.taskIds.map((id) => safeString(id, 100)).filter((id) => getTask(id)) : [];
    if (!taskIds.length) return res.status(400).json({ error: 'Выберите хотя бы одно задание' });
    const assignment = { id: `assignment-${Date.now()}`, title: safeString(req.body.title, 120) || 'Задание класса', classId: safeString(req.body.classId, 40) || 'class-7a', taskIds, dueDate: safeString(req.body.dueDate, 20) || null, published: Boolean(req.body.published), createdAt: new Date().toISOString() };
    storage.update((state) => { state.assignments.push(assignment); return state; });
    res.json({ assignment });
  });

  app.get('/api/teacher/export.csv', requireAuth('teacher'), (req, res) => {
    const rows = [['Имя', 'Класс', 'Навык', 'Предмет', 'Верно', 'Дата'], ...storage.read().attempts.map((a) => [a.studentName, a.classId, a.skill, a.subject, a.correct ? 'да' : 'нет', a.createdAt.slice(0, 10)])];
    const csv = rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(';')).join('\n');
    res.set('Content-Type', 'text/csv; charset=utf-8');
    res.set('Content-Disposition', 'attachment; filename="saulat-progress.csv"');
    res.send(`\uFEFF${csv}`);
  });

  app.get('/api/admin/summary', requireAuth('admin'), (req, res) => {
    const state = storage.read();
    res.json({ classes: getClassCodes(), attempts: state.attempts.length, students: new Set(state.attempts.map((a) => a.studentKey)).size, assignments: state.assignments.length, sourceTexts: state.sourceTexts.length, syncEnabled: state.settings.syncEnabled });
  });
  app.get('/api/admin/backup', requireAuth('admin'), (req, res) => { res.json({ exportedAt: new Date().toISOString(), state: storage.read() }); });
  app.post('/api/admin/restore', requireAuth('admin'), (req, res) => {
    const incoming = req.body?.state;
    if (!incoming || !Array.isArray(incoming.attempts) || !Array.isArray(incoming.assignments)) return res.status(400).json({ error: 'Неверный формат резервной копии' });
    storage.write({ attempts: incoming.attempts, assignments: incoming.assignments, sourceTexts: Array.isArray(incoming.sourceTexts) ? incoming.sourceTexts : [], settings: incoming.settings || { schoolName: 'Сауат', syncEnabled: false } });
    res.json({ ok: true });
  });

  app.get('*', (req, res) => res.sendFile(path.join(root, 'public', 'index.html')));
  return app;
}

function studentKey(user) { return `${user.classId}:${user.name.toLowerCase()}`; }
function percent(value, total) { return total ? Math.round((value / total) * 100) : 0; }
function progressFor(rows) {
  const skills = ['find', 'infer', 'evaluate', 'math'];
  const skillStats = Object.fromEntries(skills.map((skill) => { const group = rows.filter((a) => a.skill === skill); return [skill, { correct: group.filter((a) => a.correct).length, attempts: group.length, accuracy: percent(group.filter((a) => a.correct).length, group.length) }]; }));
  const days = new Set(rows.map((a) => a.createdAt.slice(0, 10)));
  return { totalAttempts: rows.length, correct: rows.filter((a) => a.correct).length, accuracy: percent(rows.filter((a) => a.correct).length, rows.length), streak: streak(rows), badges: badges(rows), skills: skillStats, days: [...days].sort().reverse().slice(0, 30) };
}
function streak(rows) {
  const days = new Set(rows.map((a) => a.createdAt.slice(0, 10)));
  let count = 0; const cursor = new Date(`${today()}T00:00:00Z`);
  while (days.has(cursor.toISOString().slice(0, 10))) { count += 1; cursor.setUTCDate(cursor.getUTCDate() - 1); }
  return count;
}
function badges(rows) {
  const badges = [];
  if (rows.length >= 1) badges.push({ id: 'first-step', label: 'Первый шаг', icon: '✦' });
  if (rows.filter((a) => a.correct).length >= 5) badges.push({ id: 'source-detective', label: 'Детектив источника', icon: '⌕' });
  if (new Set(rows.map((a) => a.skill)).size >= 3) badges.push({ id: 'wide-angle', label: 'Широкий взгляд', icon: '◉' });
  return badges;
}
function weekly(rows) {
  const map = new Map();
  rows.forEach((row) => { const week = row.createdAt.slice(0, 7); const entry = map.get(week) || { week, attempts: 0, correct: 0 }; entry.attempts += 1; if (row.correct) entry.correct += 1; map.set(week, entry); });
  return [...map.values()].map((entry) => ({ ...entry, accuracy: percent(entry.correct, entry.attempts) }));
}
function generateTeacherTasks(source) {
  const sentences = source.text.split(/(?<=[.!?])\s+/).filter(Boolean).slice(0, 5);
  return sentences.map((sentence, index) => ({ id: `draft-${source.id}-${index + 1}`, skill: index % 3 === 0 ? 'find' : index % 3 === 1 ? 'infer' : 'evaluate', question: index % 3 === 0 ? 'Какой факт прямо указан в предложении?' : index % 3 === 1 ? 'Какой вывод можно сделать?' : 'Зачем этот фрагмент нужен читателю?', source: sentence, status: 'draft' }));
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  const port = Number(process.env.PORT || 3000);
  createApp().listen(port, () => console.log(`Сауат запущен: http://localhost:${port} (${modeLabel()})`));
}
