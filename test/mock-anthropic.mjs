// TEST DOUBLE — a local stand-in for the Anthropic Messages API, used to test the
// app server's request construction and error handling. Replies come from
// synthetic-llm.mjs. Start: node test/mock-anthropic.mjs [port]
import http from 'node:http';
import { appendFileSync } from 'node:fs';
import { respond } from './synthetic-llm.mjs';

const PORT = Number(process.argv[2] ?? 8799);
const LOG = process.env.MOCK_LOG ?? '';
const EXPECTED_KEY = process.env.MOCK_EXPECTED_KEY ?? 'test-key';

http.createServer(async (req, res) => {
  let raw = '';
  for await (const c of req) raw += c;
  const body = raw ? JSON.parse(raw) : {};
  // The SDK (v1.x) sends the key as "Authorization: Bearer <key>"; older clients use x-api-key.
  const key = req.headers['x-api-key'] ?? (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '');
  const entry = { at: new Date().toISOString(), path: req.url, apiKeyPresent: !!key, keyMatches: key === EXPECTED_KEY,
    beta: req.headers['anthropic-beta'] ?? null, model: body.model, max_tokens: body.max_tokens, effort: body.output_config?.effort, fallbacks: body.fallbacks,
    systemStart: String(body.system ?? '').slice(0, 80), userHasFunction: /"selectedFunction"/.test(body.messages?.[0]?.content ?? '') };
  if (LOG) appendFileSync(LOG, JSON.stringify(entry) + '\n');
  const json = (status, obj) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(obj)); };
  if (key !== EXPECTED_KEY) return json(401, { type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } });
  try {
    const text = respond(body.system, body.messages?.[0]?.content ?? '');
    json(200, { id: 'msg_mock', type: 'message', role: 'assistant', model: `${body.model} (mock)`, content: [{ type: 'text', text }], stop_reason: 'end_turn', stop_sequence: null, usage: { input_tokens: 1000, output_tokens: 2000 } });
  } catch (e) {
    json(500, { type: 'error', error: { type: 'api_error', message: e.message } });
  }
}).listen(PORT, '127.0.0.1', () => console.log(`mock anthropic on ${PORT}`));
