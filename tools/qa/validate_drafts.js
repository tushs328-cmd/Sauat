import { formatDiagnostics, validateContentDirectory } from '../../src/content-validator.js';

const result = validateContentDirectory(process.argv[2] || 'content_drafts');
console.log(formatDiagnostics(result));
process.exitCode = result.valid ? 0 : 1;
