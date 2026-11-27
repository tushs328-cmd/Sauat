import crypto from 'node:crypto';

const sessions = new Map();
const classCodes = new Map([
  ['SAULAT7', { id: 'class-7a', name: '7A', grade: 7 }],
  ['SAULAT8', { id: 'class-8a', name: '8A', grade: 8 }],
  ['SAULAT9', { id: 'class-9a', name: '9A', grade: 9 }]
]);

export function login({ role, name = '', classCode = '' } = {}) {
  const normalizedRole = String(role || '').toLowerCase();
  const normalizedName = String(name || '').trim().replace(/\s+/g, ' ');
  const normalizedCode = String(classCode || '').trim().toUpperCase();
  if (!['student', 'teacher', 'admin'].includes(normalizedRole)) throw new Error('Неизвестная роль');
  if (normalizedRole === 'student') {
    if (normalizedName.length < 2 || normalizedName.length > 40 || /[@<>]/.test(normalizedName)) throw new Error('Введите только имя или псевдоним без почты');
    const klass = classCodes.get(normalizedCode);
    if (!klass) throw new Error('Проверьте код класса');
    return create({ role: normalizedRole, name: normalizedName, classCode: normalizedCode, classId: klass.id, className: klass.name, grade: klass.grade });
  }
  if (normalizedRole === 'teacher' && normalizedCode !== 'USTAZ7') throw new Error('Неверный код учителя');
  if (normalizedRole === 'admin' && normalizedCode !== 'ADMIN1') throw new Error('Неверный код администратора');
  return create({ role: normalizedRole, name: normalizedName || (normalizedRole === 'teacher' ? 'Учитель' : 'Администратор'), classCode: normalizedCode, classId: 'school', className: 'Школа', grade: null });
}

function create(user) {
  const token = crypto.randomBytes(24).toString('hex');
  const safeUser = { ...user, sessionId: token };
  sessions.set(token, safeUser);
  return safeUser;
}

export function getSession(token) {
  return token ? sessions.get(token) : null;
}

export function requireAuth(...roles) {
  return (req, res, next) => {
    const user = getSession(req.get('x-session-token'));
    if (!user) return res.status(401).json({ error: 'Требуется вход' });
    if (roles.length && !roles.includes(user.role)) return res.status(403).json({ error: 'Недостаточно прав' });
    req.user = user;
    next();
  };
}

export function clearSessions() {
  sessions.clear();
}

export function getClassCodes() {
  return [...classCodes.entries()].map(([code, value]) => ({ code, ...value }));
}
