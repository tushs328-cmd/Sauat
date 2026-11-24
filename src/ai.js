export async function askLocalMentor({ task, level }) {
  const baseUrl = process.env.OLLAMA_URL;
  if (!baseUrl) return null;
  const prompt = `Ты — наставник по функциональной грамотности для ученика 7–9 класса. Дай только подсказку уровня ${level}, не называй правильный вариант и не пересказывай ответ. Всегда укажи короткую опору на цитату. Вопрос: ${task.question}\nЦитата: ${task.quote}\nВарианты: ${task.options.map((option, index) => `${index + 1}) ${option}`).join(' | ')}`;
  try {
    const response = await fetch(`${baseUrl.replace(/\/$/, '')}/api/generate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: process.env.OLLAMA_MODEL || 'qwen2.5:1.5b', prompt, stream: false, options: { temperature: 0.2 } }),
      signal: AbortSignal.timeout(3500)
    });
    if (!response.ok) return null;
    const result = await response.json();
    const text = String(result.response || '').trim();
    if (!text || text.length > 1200) return null;
    const answerText = task.options?.[task.answer] ? task.options[task.answer].toLowerCase() : '';
    if ((answerText && text.toLowerCase().includes(answerText)) || /правильн(ый|ый вариант)|ответ\s*:/i.test(text)) return null;
    return text;
  } catch { return null; }
}

export async function askLocalGrader({ task, text }) {
  const baseUrl = process.env.OLLAMA_URL;
  if (!baseUrl) return null;
  try {
    const response = await fetch(`${baseUrl.replace(/\/$/, '')}/api/generate`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ model: process.env.OLLAMA_MODEL || 'qwen2.5:1.5b', prompt: `Оцени свободный ответ ученика только по источнику. Верни ровно YES или NO. Источник: ${task.quote}\nОтвет: ${text}`, stream: false, options: { temperature: 0 } }), signal: AbortSignal.timeout(3500) });
    if (!response.ok) return null;
    const result = await response.json();
    const output = String(result.response || '').trim().toUpperCase();
    return output === 'YES' ? true : output === 'NO' ? false : null;
  } catch { return null; }
}
