import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, chmodSync, statSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import { paymentConfigRevision, savePaymentConfig } from '../dist/services/payments/config-store.js';
import { validatePaymentConfig } from '../dist/services/payments/config.js';

test('private configuration saves atomically, rejects stale edits and preserves previous credentials', () => {
  const dir = mkdtempSync(join(tmpdir(), 'chatq-config-store-'));
  chmodSync(dir, 0o700);
  const before = { ...process.env }, path = join(dir, 'merchant.json');
  process.env.NODE_ENV = 'test';
  process.env.CHATQ_PAYMENT_CONFIG_FILE = path;
  const config = validatePaymentConfig({ appId: randomUUID(), endpoint: 'https://gateway.example', mchNo: 'M1', merchantAppId: 'A1', secret: randomBytes(32).toString('hex'), notifyUrl: 'https://chatq.example/api/aikeyboard/payments/notify', cashierOrigin: 'https://cashier.example' });
  try {
    assert.equal(paymentConfigRevision(), 'none');
    assert.throws(() => savePaymentConfig(config, 'none', 'fixture'), /尚未开放/);
    process.env.CHATQ_PAYMENT_ADMIN_WRITE = 'true';
    const first = savePaymentConfig(config, 'none', 'fixture');
    assert.match(first, /^[a-f0-9]{64}$/);
    assert.equal(paymentConfigRevision(), first);
    assert.deepEqual(JSON.parse(readFileSync(path)), config);
    assert.equal(savePaymentConfig(config, first, 'fixture'), first);
    assert.throws(() => savePaymentConfig({ ...config, mchNo: 'M2' }, 'none', 'fixture'), /已被修改/);
    assert.throws(() => savePaymentConfig({ ...config, appId: randomUUID() }, first, 'fixture'), /其他应用/);
    writeFileSync(path + '.lock', '');
    assert.throws(() => savePaymentConfig(config, first, 'fixture'), /正在保存/);
    rmSync(path + '.lock');
    const second = savePaymentConfig({ ...config, mchNo: 'M2' }, first, 'fixture');
    assert.notEqual(second, first);
    const backups = readdirSync(dir).filter(n => n.includes('.previous-'));
    assert.equal(backups.length, 1);
    assert.deepEqual(JSON.parse(readFileSync(join(dir, backups[0]))), config);
    for (const name of readdirSync(dir)) {
      if (name.includes('.audit-')) assert.ok(!readFileSync(join(dir, name), 'utf8').includes(config.secret));
      if (process.platform !== 'win32') assert.equal(statSync(join(dir, name)).mode & 0o077, 0);
    }
    writeFileSync(path, 'broken JSON');
    assert.throws(() => savePaymentConfig(config, paymentConfigRevision(), 'fixture'), /原支付配置异常/);
    assert.equal(readFileSync(path, 'utf8'), 'broken JSON');
    assert.ok(!readdirSync(dir).some(n => n.endsWith('.lock') || n.endsWith('.tmp')));
    if (process.platform !== 'win32') {
      chmodSync(dir, 0o755);
      assert.throws(() => savePaymentConfig(config, paymentConfigRevision(), 'fixture'), /目录权限/);
    }
    process.env.CHATQ_PAYMENT_CONFIG_FILE = join(dir, 'absent', 'merchant.json');
    assert.throws(() => savePaymentConfig(config, 'none', 'fixture'), /保存失败/);
  } finally {
    process.env = before;
    rmSync(dir, { recursive: true, force: true });
  }
});
