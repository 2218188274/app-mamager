import { closeSync, existsSync, fsyncSync, lstatSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { TRPCError } from '@trpc/server';
import { inspectPaymentConfig, type PaymentConfig } from './config.js';

export function paymentConfigRevision(path = process.env.CHATQ_PAYMENT_CONFIG_FILE) {
  if (!path || !existsSync(path)) return 'none';
  const info = lstatSync(path);
  if (!info.isFile() || info.isSymbolicLink() || info.size > 32768) throw new TRPCError({ code: 'PRECONDITION_FAILED', message: '私有支付配置异常，请维护人员检查文件' });
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

export function paymentConfigEditable() {
  return process.env.CHATQ_PAYMENT_ADMIN_WRITE === 'true' && !!process.env.CHATQ_PAYMENT_CONFIG_FILE;
}

// The path is deployment-owned; neither the browser nor a request chooses a file path.
export function savePaymentConfig(config: PaymentConfig, expectedRevision: string, actorId: string) {
  const path = process.env.CHATQ_PAYMENT_CONFIG_FILE;
  if (!paymentConfigEditable() || !path || !isAbsolute(path)) throw new TRPCError({ code: 'PRECONDITION_FAILED', message: '服务器尚未开放私有配置保存，请先完成目录挂载' });
  const lock = path + '.lock', temporary = path + '.' + randomUUID() + '.tmp';
  let descriptor: number | undefined;
  try {
    const parent = lstatSync(dirname(path));
    if (!parent.isDirectory() || parent.isSymbolicLink() || process.platform !== 'win32' && (parent.mode & 0o077) !== 0) throw new TRPCError({ code: 'PRECONDITION_FAILED', message: '私有配置目录权限不正确，需要仅属主可访问' });
    try { descriptor = openSync(lock, 'wx', 0o600); } catch { throw new TRPCError({ code: 'CONFLICT', message: '支付配置正在保存，请稍后刷新重试' }); }
    if (paymentConfigRevision(path) !== expectedRevision) throw new TRPCError({ code: 'CONFLICT', message: '支付配置已被修改，请刷新后重新填写' });
    const current = inspectPaymentConfig(path);
    if (!['file_missing', 'ready'].includes(current.status)) throw new TRPCError({ code: 'PRECONDITION_FAILED', message: '原支付配置异常，已保留原文件，请维护人员核对' });
    if (current.config && current.config.appId !== config.appId) throw new TRPCError({ code: 'CONFLICT', message: '此网关已绑定其他应用，不能覆盖其商户配置' });
    const body = JSON.stringify(config, null, 2) + '\n';
    if (current.config && JSON.stringify(current.config) === JSON.stringify(config)) return expectedRevision;
    const id = randomUUID();
    if (existsSync(path)) writeFileSync(path + '.previous-' + id, readFileSync(path), { flag: 'wx', mode: 0o600 });
    const fd = openSync(temporary, 'wx', 0o600);
    try { writeFileSync(fd, body); fsyncSync(fd); } finally { closeSync(fd); }
    const revision = createHash('sha256').update(body).digest('hex');
    writeFileSync(path + '.audit-' + id, JSON.stringify({ event: 'config-save-attempt', appId: config.appId, actorId, at: new Date().toISOString(), previousRevision: expectedRevision, revision }) + '\n', { flag: 'wx', mode: 0o600 });
    renameSync(temporary, path);
    return revision;
  } catch (error) {
    if (error instanceof TRPCError) throw error;
    throw new TRPCError({ code: 'PRECONDITION_FAILED', message: '私有配置保存失败，请检查服务器权限和磁盘空间后刷新重试' });
  } finally {
    if (existsSync(temporary)) unlinkSync(temporary);
    if (descriptor !== undefined) { closeSync(descriptor); unlinkSync(lock); }
  }
}
