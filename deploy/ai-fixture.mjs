// Local-only protocol fixture. Never configure this as a production AI provider.
import { createServer } from 'node:http';
createServer(async (req, res) => {
  if (req.url === '/health') return res.end('ok');
  let raw = '';
  for await (const chunk of req) raw += chunk;
  const body = JSON.parse(raw);
  if (req.headers.authorization !== 'Bearer fixture-secret-never-return' || body.model === 'error401') {
    res.writeHead(401); return res.end(JSON.stringify({ error: 'fixture-secret-never-return' }));
  }
  if (body.model === 'error429') { res.writeHead(429); return res.end('{}'); }
  if (body.model === 'invalid') return res.end('{}');
  const count = Number(body.messages[0].content.match(/给出 (\d+) 条/)?.[1] ?? 1);
  const values = Array.from({ length: count }, (_, i) => `协议测试回复 ${i + 1} (${body.model})`);
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ model: body.model, choices: [{ message: { content: count === 1 ? values[0] : JSON.stringify(values) }, finish_reason: 'stop' }], usage: { total_tokens: 42 } }));
}).listen(9100, '0.0.0.0');
