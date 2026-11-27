import ru from './ru.js';
import kk from './kk.js';

export const dictionaries = { ru, kk };
export function dictionary(lang) { return dictionaries[lang] || ru; }
