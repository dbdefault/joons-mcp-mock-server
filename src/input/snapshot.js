import { isPlainObject, hasOwn, stripControls } from '../util/object.js';

export function validateSnapshot(value) {
  const errors = [];
  const add = (path, message) => { if (errors.length < 100) errors.push({ path, message }); };
  const check = (condition, path, message) => { if (!condition) add(path, message); };
  if (!isPlainObject(value)) return { ok: false, errors: [{ path: '', message: 'expected object' }] };
  check(value.format === 'joons-mcp-diff/snapshot', '/format', 'invalid format');
  check(value.schemaVersion === 1, '/schemaVersion', 'invalid schema version');
  check(typeof value.createdAt === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/.test(value.createdAt) && !Number.isNaN(Date.parse(value.createdAt)), '/createdAt', 'expected ISO date');
  check(value.label === null || typeof value.label === 'string', '/label', 'expected string or null');
  for (const [key, fields] of [['tool', ['name', 'version']], ['server', ['name', 'version', 'protocolVersion']]]) {
    if (!isPlainObject(value[key])) { add('/' + key, 'expected object'); continue; }
    for (const field of fields) check(hasOwn(value[key], field) && typeof value[key][field] === 'string', `/${key}/${field}`, 'expected string');
  }
  const names = new Set();
  if (!Array.isArray(value.tools)) add('/tools', 'expected array');
  else {
    check(value.tools.length <= 10000, '/tools', 'too many tools');
    value.tools.slice(0, 10001).forEach((tool, i) => {
      const path = `/tools/${i}`;
      if (!isPlainObject(tool)) { add(path, 'expected object'); return; }
      if (typeof tool.name !== 'string' || !tool.name.length || tool.name.length > 1000 || stripControls(tool.name) !== tool.name) add(path + '/name', 'invalid tool name');
      else if (names.has(tool.name)) add(path + '/name', 'duplicate tool name'); else names.add(tool.name);
      for (const key of ['title', 'description']) check(hasOwn(tool, key) && (tool[key] === null || typeof tool[key] === 'string'), path + '/' + key, 'expected string or null');
      check(isPlainObject(tool.inputSchema) && tool.inputSchema.type === 'object', path + '/inputSchema', 'expected object schema');
      check(tool.outputSchema === null || (isPlainObject(tool.outputSchema) && tool.outputSchema.type === 'object'), path + '/outputSchema', 'expected object schema or null');
      check(tool.annotations === null || isPlainObject(tool.annotations), path + '/annotations', 'expected object or null');
    });
  }
  if (!isPlainObject(value.stats)) add('/stats', 'expected object');
  else {
    check(Array.isArray(value.tools) && value.stats.toolCount === value.tools.length, '/stats/toolCount', 'tool count mismatch');
    check(Number.isInteger(value.stats.pages) && value.stats.pages >= 0, '/stats/pages', 'expected nonnegative integer');
  }
  return { ok: errors.length === 0, errors };
}
