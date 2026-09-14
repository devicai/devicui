const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadTs } = require('./helpers/loadTs.cjs');
const { isRenderedLimitError } = loadTs(require('node:path').join(__dirname, '../src/utils/limitError.ts'));
test('a rendered custom limit banner suppresses only its duplicate error', () => {
  const error = Object.assign(new Error('private usage amounts'), { errorType: 'TENANT_LIMIT_EXCEEDED' });
  const limit = { message: error.message };
  assert.equal(isRenderedLimitError(error, limit, true), true);
  assert.equal(isRenderedLimitError(new Error(limit.message), limit, true), true);
  assert.equal(isRenderedLimitError(error, limit, false), false);
  assert.equal(isRenderedLimitError(new Error('Network unavailable'), limit, true), false);
  assert.equal(isRenderedLimitError(error, null, true), false);
});
