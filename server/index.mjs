// GBS Change Intelligence — standalone server.
// Serves the built app (dist/) and a narrow AI endpoint that calls the Anthropic
// API server-side. The API key is read from the environment only; it is never
// sent to the browser or written to disk.
//
//   ANTHROPIC_API_KEY=... npm run serve        # http://localhost:8787
//   Optional: AI_MODEL (default claude-opus-5-5), AI_EFFORT (default medium), PORT, HOST
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Anthropic from '@anthropic-ai/sdk';

const here = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.resolve(here, '..', process.env.DIST_DIR ?? 'dist');
const PORT = Number(process.env.PORT ?? 8787);
const HOST = process.env.HOST ?? '127.0.0.1';
const MODEL = process.env.AI_MODEL ?? 'claude-opus-5-5';
const EFFORT = process.env.AI_EFFORT ?? 'medium';
const configured = () => !!process.env.ANTHROPIC_API_KEY;

// Re-created if the key in the environment changes (e.g. rotated without restart).
let client = null; let clientKey = '';
const getClient = () => {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!client || clientKey !== key) { client = new Anthropic({ apiKey: key, authToken: null, maxRetries: 2, timeout: 10 * 60 * 1000 }); clientKey = key; }
  return client;
};

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2' };

// Simple per-process rate limit: 40 AI requests per rolling minute.
const hits = [];
const rateLimited = () => { const now = Date.now(); while (hits.length && now - hits[0] > 60_000) hits.shift(); if (hits.length >= 40) return true; hits.push(now); return false; };

function send(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
}

async function readBody(req, limit = 400_000) {
  let size = 0; const chunks = [];
  for await (const c of req) { size += c.length; if (size > limit) throw Object.assign(new Error('Request too large'), { status: 413 }); chunks.push(c); }
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}

async function complete(req, res) {
  if (!configured()) return send(res, 503, { error: { code: 'not_configured', message: 'ANTHROPIC_API_KEY is not set on the server.' } });
  if (rateLimited()) return send(res, 429, { error: { code: 'rate_limited', message: 'Too many AI requests; wait a minute.' } });
  let body;
  try { body = await readBody(req); } catch (e) { return send(res, e.status ?? 400, { error: { code: 'bad_input', message: e.message } }); }
  const { system, user, maxTokens, purpose } = body ?? {};
  if (typeof system !== 'string' || typeof user !== 'string' || !user.trim()) return send(res, 400, { error: { code: 'bad_input', message: 'system and user text are required' } });
  if (system.length > 20_000 || user.length > 150_000) return send(res, 413, { error: { code: 'too_large', message: 'Prompt too large' } });
  const max_tokens = Math.min(Math.max(Number(maxTokens) || 16000, 1024), 16000);
  const t0 = Date.now();
  try {
    const msg = await getClient().beta.messages.create({
      model: MODEL,
      max_tokens,
      system,
      messages: [{ role: 'user', content: user }],
      output_config: { effort: EFFORT },
      // Server-side refusal fallback (routes by refusal category).
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
    });
    if (msg.stop_reason === 'refusal') return send(res, 422, { error: { code: 'refused', message: msg.stop_details?.explanation ?? 'The model declined this request.' } });
    const text = msg.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
    console.log(`[ai] ${purpose ?? 'request'} ok model=${msg.model} in=${msg.usage?.input_tokens} out=${msg.usage?.output_tokens} ${Date.now() - t0}ms`);
    return send(res, 200, { text, model: msg.model, truncated: msg.stop_reason === 'max_tokens' });
  } catch (e) {
    console.error(`[ai] ${purpose ?? 'request'} failed: ${e?.status ?? ''} ${e?.message ?? e}`);
    if (e instanceof Anthropic.AuthenticationError) return send(res, 502, { error: { code: 'auth', message: 'The Anthropic API rejected the server API key.' } });
    if (e instanceof Anthropic.RateLimitError) return send(res, 429, { error: { code: 'rate_limited', message: 'Anthropic API rate limit reached; try again shortly.' } });
    if (e instanceof Anthropic.BadRequestError) return send(res, 400, { error: { code: 'bad_input', message: `Request rejected: ${e.message}` } });
    if (e instanceof Anthropic.APIError) return send(res, 502, { error: { code: 'upstream', message: `Anthropic API error ${e.status ?? ''}`.trim() } });
    return send(res, 502, { error: { code: 'upstream', message: 'Could not reach the Anthropic API.' } });
  }
}

async function staticFile(req, res) {
  const url = new URL(req.url, 'http://x');
  let p = path.normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, '');
  let file = path.join(DIST, p);
  if (!file.startsWith(DIST)) { res.writeHead(403); return res.end(); }
  try { if ((await stat(file)).isDirectory()) file = path.join(file, 'index.html'); } catch { file = path.join(DIST, 'index.html'); }
  try {
    const data = await readFile(file);
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] ?? 'application/octet-stream' });
    res.end(data);
  } catch { res.writeHead(404); res.end('Not found — run npm run build first.'); }
}

export function createServer() {
  return http.createServer(async (req, res) => {
    if (req.url === '/api/ai/status' && req.method === 'GET') return send(res, 200, { configured: configured(), provider: 'anthropic', model: MODEL });
    if (req.url === '/api/ai/complete' && req.method === 'POST') return complete(req, res);
    if (req.url?.startsWith('/api/')) return send(res, 404, { error: { code: 'not_found', message: 'Unknown endpoint' } });
    return staticFile(req, res);
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  createServer().listen(PORT, HOST, () => console.log(`GBS Change Intelligence on http://${HOST}:${PORT} — AI ${configured() ? `configured (${MODEL})` : 'NOT configured (set ANTHROPIC_API_KEY)'}`));
}
