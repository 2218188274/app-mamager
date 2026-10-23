import { keyboardBridge } from '../../modules/chatq-keyboard';
import * as SQLite from 'expo-sqlite';
import { ChatMessage, Conversation } from '../types';

const DB_NAME = 'yourkeeboard.db';

let db: SQLite.SQLiteDatabase | null = null;
let initialization: Promise<void> | null = null;

// 初始化数据库
export async function initDatabase(): Promise<void> {
  if (!initialization) initialization = initialize().catch(error => { initialization = null; throw error; });
  return initialization;
}

async function initialize(): Promise<void> {
  db = await SQLite.openDatabaseAsync(DB_NAME);

  await db.execAsync(`
    PRAGMA foreign_keys = ON;
    PRAGMA secure_delete = ON;
    CREATE TABLE IF NOT EXISTS conversations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      createdAt INTEGER NOT NULL,
      updatedAt INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conversationId INTEGER NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
      content TEXT NOT NULL,
      createdAt INTEGER NOT NULL,
      FOREIGN KEY (conversationId) REFERENCES conversations(id) ON DELETE CASCADE
    );
  `);
}

// 创建新对话
export async function createConversation(title: string): Promise<Conversation> {
  if (!db) throw new Error('Database not initialized');

  const now = Date.now();
  const result = await db.runAsync(
    'INSERT INTO conversations (title, createdAt, updatedAt) VALUES (?, ?, ?)',
    [title, now, now]
  );

  return {
    id: result.lastInsertRowId,
    title,
    createdAt: now,
    updatedAt: now,
  };
}

// 获取所有对话
export async function getConversations(): Promise<Conversation[]> {
  if (!db) throw new Error('Database not initialized');

  const rows = await db.getAllAsync<Conversation>(
    'SELECT * FROM conversations ORDER BY updatedAt DESC'
  );
  return rows;
}

/** Commit both sides together; a failed write must not leave an empty record. */
export async function saveReplyConversation(prompt: string, replies: string[], kind: 'reply' | 'topic' | 'polish' = 'reply'): Promise<void> {
  if (keyboardBridge?.saveGenerationHistory) { await migrateHistory(); await keyboardBridge.saveGenerationHistory(prompt, JSON.stringify(replies), kind); return; }
  await initDatabase();
  if (!db) throw new Error('Database not initialized');
  await db.withExclusiveTransactionAsync(async transaction => {
    const now = Date.now();
    const row = await transaction.runAsync('INSERT INTO conversations (title, createdAt, updatedAt) VALUES (?, ?, ?)', [prompt.trim().slice(0, 30), now, now]);
    await transaction.runAsync('INSERT INTO messages (conversationId, role, content, createdAt) VALUES (?, ?, ?, ?)', [row.lastInsertRowId, 'user', prompt.trim(), now]);
    for (const reply of replies) await transaction.runAsync('INSERT INTO messages (conversationId, role, content, createdAt) VALUES (?, ?, ?, ?)', [row.lastInsertRowId, 'assistant', reply, now + 1]);
  });
}

export async function searchConversations(query: string): Promise<Conversation[]> {
  if (keyboardBridge?.listGenerationHistory) { await migrateHistory(); const rows = JSON.parse(await keyboardBridge.listGenerationHistory(query)); return rows.map((r: NativeRecord) => ({ id: r.id, title: r.prompt.slice(0, 30) || 'AI 话题灵感', createdAt: r.createdAt, updatedAt: r.createdAt, source: r.source, kind: r.kind })); }
  await initDatabase();
  if (!db) throw new Error('Database not initialized');
  const value = `%${query.trim().replace(/[\\%_]/g, c => `\\${c}`)}%`;
  return db.getAllAsync<Conversation>(`SELECT c.* FROM conversations c WHERE c.title LIKE ? ESCAPE '\\' OR EXISTS (SELECT 1 FROM messages m WHERE m.conversationId = c.id AND m.content LIKE ? ESCAPE '\\') ORDER BY c.updatedAt DESC LIMIT 100`, [value, value]);
}

// 获取对话的消息
export async function getMessages(conversationId: number): Promise<ChatMessage[]> {
  if (keyboardBridge?.getGenerationHistory) { const r: NativeRecord = JSON.parse(await keyboardBridge.getGenerationHistory(conversationId)); return [{ id: 0, conversationId, role: 'user', content: r.prompt || '无补充背景', createdAt: r.createdAt }, ...r.replies.map((content, i) => ({ id: i + 1, conversationId, role: 'assistant' as const, content, createdAt: r.createdAt }))]; }
  if (!db) throw new Error('Database not initialized');

  const rows = await db.getAllAsync<ChatMessage>(
    'SELECT * FROM messages WHERE conversationId = ? ORDER BY createdAt ASC, id ASC',
    [conversationId]
  );
  return rows;
}

// 添加消息
export async function addMessage(
  conversationId: number,
  role: 'user' | 'assistant',
  content: string
): Promise<ChatMessage> {
  if (!db) throw new Error('Database not initialized');

  const now = Date.now();
  const result = await db.runAsync(
    'INSERT INTO messages (conversationId, role, content, createdAt) VALUES (?, ?, ?, ?)',
    [conversationId, role, content, now]
  );

  // 更新对话的更新时间
  await db.runAsync(
    'UPDATE conversations SET updatedAt = ? WHERE id = ?',
    [now, conversationId]
  );

  return {
    id: result.lastInsertRowId,
    conversationId,
    role,
    content,
    createdAt: now,
  };
}

// 删除对话及其消息
export async function deleteConversation(id: number): Promise<void> {
  if (keyboardBridge?.deleteGenerationHistory) { await keyboardBridge.deleteGenerationHistory(id); return; }
  if (!db) throw new Error('Database not initialized');

  await db.runAsync('DELETE FROM conversations WHERE id = ?', [id]);
}

// 更新对话标题
export async function updateConversationTitle(
  id: number,
  title: string
): Promise<void> {
  if (!db) throw new Error('Database not initialized');

  await db.runAsync(
    'UPDATE conversations SET title = ?, updatedAt = ? WHERE id = ?',
    [title, Date.now(), id]
  );
}

type NativeRecord = { id: number; source: 'app' | 'keyboard'; kind: 'reply' | 'topic' | 'polish'; prompt: string; replies: string[]; createdAt: number };
let migration: Promise<void> | null = null;
export async function migrateHistory(): Promise<void> {
  if (!keyboardBridge?.migrateGenerationHistory) return;
  if (!migration) migration = (async () => {
    await initDatabase();
    const rows = await db!.getAllAsync<Conversation>('SELECT * FROM conversations ORDER BY id');
    const records: { uid: string; source: string; kind: string; prompt: string; replies: string[]; createdAt: number }[] = [];
    for (const row of rows) {
      const messages = await db!.getAllAsync<ChatMessage>('SELECT * FROM messages WHERE conversationId = ? ORDER BY createdAt,id', [row.id]);
      let prompt = row.title, replies: string[] = [], part = 0;
      const flush = () => {
        for (let i = 0; i < replies.length; i += 3) {
          const uid = 'legacy-' + row.id + '-' + row.createdAt + (part ? '-part-' + part : '');
          records.push({ uid, source: 'app', kind: 'reply', prompt: prompt.slice(0, 1000), replies: replies.slice(i, i + 3), createdAt: row.createdAt });
          part++;
        }
        replies = [];
      };
      for (const message of messages) {
        if (message.role === 'user') { flush(); prompt = message.content; }
        else if (message.content) replies.push(message.content);
      }
      flush();
    }
    await keyboardBridge!.migrateGenerationHistory!(JSON.stringify(records));
    await db!.runAsync('DELETE FROM conversations');
  })().catch(e => { migration = null; throw e; });
  return migration;
}
export async function clearHistory() {
  await migrateHistory();
  if (keyboardBridge?.clearGenerationHistory) await keyboardBridge.clearGenerationHistory();
  else { await initDatabase(); await db!.runAsync('DELETE FROM conversations'); }
}
