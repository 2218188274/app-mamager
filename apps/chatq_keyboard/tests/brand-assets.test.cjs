const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('brand and generated iOS icons retain their binary PNG bytes', () => {
  const files = [
    'assets/brand/icon.png',
    'assets/brand/adaptive-foreground.png',
    'ios/app/Images.xcassets/AppIcon.appiconset/App-Icon-1024x1024@1x.png',
  ];
  for (const file of files) {
    const bytes = fs.readFileSync(path.join(__dirname, '..', file));
    assert(bytes.length >= 45, `${file}: truncated PNG`);
    assert.deepEqual(bytes.subarray(0, 8), Buffer.from('89504e470d0a1a0a', 'hex'),
      `${file}: PNG signature changed; copy images as binary without newline conversion`);
    assert.equal(bytes.subarray(12, 16).toString('ascii'), 'IHDR', `${file}: missing PNG header`);
    assert.equal(bytes.readUInt32BE(16), 1024, `${file}: icon width`);
    assert.equal(bytes.readUInt32BE(20), 1024, `${file}: icon height`);
    assert.deepEqual(bytes.subarray(-12), Buffer.from('0000000049454e44ae426082', 'hex'),
      `${file}: missing PNG end marker`);
  }
});
