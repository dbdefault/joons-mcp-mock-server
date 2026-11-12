import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseArgs } from '../src/args.js';

test('usage errors cover commands, options, values, duplicates and ranges', () => {
  const cases = [[], ['bad'], ['start'], ['validate-fixtures'], ['validate', '--snapshot', 'x', '--bad'], ['start', '--snapshot'], ['start', '--snapshot=x', '--snapshot=y'], ['start', '--snapshot=x', '--quiet=yes'], ['validate', '--snapshot=x', '--format=bad'], ['start', '--snapshot=x', '--slow-delay-ms=30001'], ['start', '--snapshot=x', '--call-timeout-ms=0'], ['start', '--snapshot=x', '--max-concurrency=65'], ['start', '--snapshot=x', '--', 'extra']];
  for (const args of cases) assert.throws(() => parseArgs(args), undefined, JSON.stringify(args));
});
test('repeatable options and range endpoints parse', () => {
  const { options } = parseArgs(['start', '--snapshot=x', '--fail-tool=a', '--fail-tool', 'b', '--mask-key=a', '--mask-key=b', '--slow-delay-ms=0', '--call-timeout-ms=60000', '--max-concurrency=1', '--']);
  assert.deepEqual(options['fail-tool'], ['a', 'b']); assert.deepEqual(options['mask-key'], ['a', 'b']);
});
