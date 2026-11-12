const specs = {
  start: { snapshot: 'one', fixtures: 'one', scenario: 'one', 'fail-tool': 'many', 'slow-delay-ms': 'one', 'call-timeout-ms': 'one', 'max-concurrency': 'one', 'no-validate-arguments': 'flag', 'mark-descriptions': 'flag', report: 'one', 'mask-key': 'many', 'no-record-arguments': 'flag', quiet: 'flag' },
  validate: { snapshot: 'one', format: 'one' },
  'validate-fixtures': { fixtures: 'one', snapshot: 'one', format: 'one' }
};
const clean = s => String(s).replace(/[\x00-\x1f\x7f-\x9f\u202a-\u202e\u2066-\u2069\u200e\u200f\u061c]/g, '').slice(0, 64).replace(/[^a-zA-Z0-9_-]/g, '?');
export function parseArgs(argv) {
  if (argv.length === 1 && (argv[0] === '--help' || argv[0] === '--version')) return { command: argv[0].slice(2), options: {} };
  const command = argv[0];
  if (!Object.hasOwn(specs, command)) throw new Error('Choose start, validate, or validate-fixtures; use --help for usage.');
  const options = Object.create(null), spec = specs[command];
  let ended = false;
  for (let i = 1; i < argv.length; i++) {
    const arg = argv[i];
    if (!ended && arg === '--') { ended = true; continue; }
    if (ended || !arg.startsWith('--')) throw new Error('Unexpected argument; use --help for usage.');
    const equal = arg.indexOf('=');
    const name = arg.slice(2, equal < 0 ? undefined : equal);
    if (!Object.hasOwn(spec, name)) throw new Error(`Unknown option --${clean(name)}; use --help for supported options.`);
    if (spec[name] !== 'many' && Object.hasOwn(options, name)) throw new Error(`Duplicate option --${name}; provide it once.`);
    if (spec[name] === 'flag') {
      if (equal >= 0) throw new Error(`Option --${name} takes no value; omit the value.`);
      options[name] = true; continue;
    }
    let value = equal >= 0 ? arg.slice(equal + 1) : argv[++i];
    if (value === undefined || value === '' || (equal < 0 && value.startsWith('--'))) throw new Error(`Option --${name} requires a value; provide one.`);
    if (spec[name] === 'many') (options[name] ??= []).push(value); else options[name] = value;
  }
  for (const name of command === 'validate-fixtures' ? ['fixtures'] : ['snapshot']) if (!Object.hasOwn(options, name)) throw new Error(`Missing --${name}; provide --${name} FILE.`);
  if (options.format !== undefined && !['terminal', 'json'].includes(options.format)) throw new Error('Invalid --format; choose terminal or json.');
  for (const [name, min, max] of [['slow-delay-ms', 0, 30000], ['call-timeout-ms', 1, 60000], ['max-concurrency', 1, 64]]) {
    if (options[name] !== undefined && (!/^(0|[1-9][0-9]*)$/.test(options[name]) || Number(options[name]) < min || Number(options[name]) > max)) throw new Error(`Invalid --${name}; use an integer from ${min} to ${max}.`);
  }
  return { command, options };
}
