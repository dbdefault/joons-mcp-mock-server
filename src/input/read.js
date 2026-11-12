import { stat, readFile } from 'node:fs/promises';

export class InputError extends Error {
  constructor(kind, message) { super(message); this.name = 'InputError'; this.kind = kind; }
}

export function parseJsonText(text, { maxBytes = 64 * 1024 * 1024, maxDepth = 64, maxNodes = 2000000 } = {}) {
  if (Buffer.byteLength(text, 'utf8') > maxBytes) throw new InputError('file_too_large', 'file exceeds size limit');
  if (text.startsWith('\uFEFF')) text = text.slice(1);
  let value;
  try { value = JSON.parse(text); } catch (error) {
    const match = /position (\d+)/.exec(error.message);
    const lineMatch = /line (\d+) column (\d+)/.exec(error.message);
    let line = 1, column = 1;
    if (lineMatch) { line = Number(lineMatch[1]); column = Number(lineMatch[2]); }
    else if (match) { const before = text.slice(0, Number(match[1])); line = before.split('\n').length; column = before.length - before.lastIndexOf('\n'); }
    else { line = text.split('\n').length; column = text.length - text.lastIndexOf('\n'); }
    throw new InputError('json_parse', `invalid JSON at ${line}:${column}`);
  }
  const maxString = maxBytes <= 16 * 1024 * 1024 ? 1000000 : 100000;
  const stack = [[value, 0]];
  let nodes = 0;
  while (stack.length) {
    const [item, depth] = stack.pop();
    if (++nodes > maxNodes) throw new InputError('limit_exceeded', 'node limit exceeded');
    if (depth > maxDepth) throw new InputError('depth_exceeded', 'depth limit exceeded');
    if (typeof item === 'string' && item.length > maxString) throw new InputError('limit_exceeded', 'string limit exceeded');
    if (item && typeof item === 'object') for (const key of Object.keys(item)) {
      if (key.length > maxString) throw new InputError('limit_exceeded', 'key limit exceeded');
      stack.push([item[key], depth + 1]);
    }
  }
  return value;
}

export async function readJsonFile(path, { maxBytes = 64 * 1024 * 1024 } = {}) {
  let bytes;
  try {
    const info = await stat(path);
    if (info.size > maxBytes) throw new InputError('file_too_large', 'file exceeds size limit');
    bytes = await readFile(path);
  } catch (error) {
    if (error instanceof InputError) throw error;
    throw new InputError(error.code === 'ENOENT' ? 'file_not_found' : 'read_failed', 'unable to read file');
  }
  if (bytes.length > maxBytes) throw new InputError('file_too_large', 'file exceeds size limit');
  let text;
  try { text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes); }
  catch { throw new InputError('json_parse', 'file is not valid UTF-8'); }
  return parseJsonText(text, { maxBytes });
}
