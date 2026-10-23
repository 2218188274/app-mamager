const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const source = ts.transpileModule(fs.readFileSync(require.resolve('../src/services/planPrice.ts'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
function price(intl = Intl) { const exports = {}; vm.runInNewContext(source, { exports, Intl: intl }); return exports.formatPlanPrice; }
test('currency codes are normalized and valid plan prices remain readable', () => {
 const format = price(); assert.match(format(1200, ' cny '), /12[.,]00/); assert.match(format(1200, 'USD'), /12[.,]00/); assert.match(format(0, 'CNY'), /0[.,]00/);
});
test('malformed legacy currency never crashes the page or pretends to be CNY', () => {
 const format = price(); for (const currency of ['12!', '', undefined, null, 123, {}, 'LONG']) assert.equal(format(1200, currency), '12.00（币种待确认）');
});
test('invalid amounts are never displayed as real prices', () => {
 const format = price(); for (const value of [-1, NaN, Infinity, '1200', null, 1.5, Number.MAX_SAFE_INTEGER + 1]) assert.equal(format(value, 'CNY'), '价格待确认');
});
test('a missing currency formatter falls back to the original normalized currency', () => {
 const format = price({ NumberFormat: function () { throw new RangeError('unsupported'); } }); assert.equal(format(1200, 'usd'), 'USD 12.00');
});
