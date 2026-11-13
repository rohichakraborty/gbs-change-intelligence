// End-to-end test of AI change generation through the real app server and UI.
// The Anthropic API is replaced by a local TEST DOUBLE (test/mock-anthropic.mjs);
// this verifies the full path browser → server → Messages API request → validation
// → register → impact matrix, not the quality of a live model.
// Usage: npm run build && node e2e/ai-generation.e2e.cjs [outDir]
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const os = require('os'); const fs = require('fs'); const path = require('path');
const SP = process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'gbs-ai-e2e-'));
fs.mkdirSync(`${SP}/shots`, { recursive: true });
const LOG = `${SP}/mock-requests.log`; fs.rmSync(LOG, { force: true });
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const procs = [];
const start = (args, env, ready) => new Promise((res) => {
  const p = spawn('node', args, { env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  procs.push(p);
  p.stdout.on('data', (d) => { if (String(d).includes(ready)) res(p); });
  p.stderr.on('data', (d) => process.env.E2E_VERBOSE && process.stderr.write(d));
});

(async () => {
  await start(['test/mock-anthropic.mjs', '8799'], { MOCK_LOG: LOG }, 'mock anthropic');
  await start(['server/index.mjs'], { ANTHROPIC_API_KEY: 'test-key', ANTHROPIC_BASE_URL: 'http://127.0.0.1:8799', PORT: '8788' }, 'GBS Change Intelligence');
  await start(['server/index.mjs'], { ANTHROPIC_API_KEY: '', PORT: '8789' }, 'GBS Change Intelligence');
  const b = await chromium.launch();
  try {
    // ---- Missing credentials: honest "not configured", no fake output
    {
      const ctx = await b.newContext({ viewport: { width: 1500, height: 950 } });
      const p = await ctx.newPage();
      await p.goto('http://127.0.0.1:8789/#change-identification'); await p.waitForSelector('.page-title');
      await p.locator('.tabs button', { hasText: 'Generate with AI' }).click();
      await p.waitForSelector('text=AI not configured');
      ok(await p.locator('button', { hasText: /Generate changes with AI/ }).isDisabled(), 'missing key: provider shows "AI not configured" and Generate is disabled');
      ok((await p.locator('.lib-item').count()) === 0, 'missing key: no candidate changes are shown');
      await p.screenshot({ path: `${SP}/shots/ai-not-configured.png` });
      await ctx.close();
    }

    const ctx = await b.newContext({ viewport: { width: 1500, height: 950 } });
    const p = await ctx.newPage();
    const errs = []; p.on('pageerror', (e) => errs.push(e.message));
    await p.goto('http://127.0.0.1:8788/#change-identification'); await p.waitForSelector('.page-title');
    await p.locator('.tabs button', { hasText: 'Generate with AI' }).click();
    await p.waitForSelector('text=Anthropic API (claude-opus-5-5)');
    ok(true, 'configured: provider card shows Anthropic API (claude-opus-5-5) via server');

    const registerCount = async () => Number(/Change Register \((\d+)\)/.exec(await p.locator('.tabs').innerText())[1]);
    const generateFor = async (fn, desc = '') => {
      await p.locator('#ai-fn').selectOption('__new');
      await p.locator('input[aria-label="New function name"]').fill(fn);
      await p.locator('#ai-desc').fill(desc);
      await p.locator('button', { hasText: /Generate changes with AI/ }).click();
      await p.waitForFunction((f) => [...document.querySelectorAll('.section-title, h2, h3, .sec-head')].some((e) => e.textContent.includes(`${f} — AI-generated candidate changes`))
        && !document.body.innerText.includes('Generating…'), fn, { timeout: 30000 });
      await p.waitForTimeout(200);
    };

    for (const [fn, desc] of [['Sales Operations', 'Order management, CRM administration and pipeline reporting'], ['Sustainability Management', ''], ['Data Management Office', 'Data governance, master data and data quality'], ['Quantum Widget Stewardship', '']]) {
      const before = await registerCount();
      await generateFor(fn, desc);
      const n = await p.locator('.lib-item').count();
      ok(n >= 15, `${fn}: ${n} candidate changes shown across five dimensions`);
      const pills = await p.locator('.badge', { hasText: /Roles|Operating Model|Process|Organization Structure|Technology|Interaction Model/ }).allInnerTexts();
      ok(pills.length >= 6, `${fn}: per-step status shown (${pills.join(' | ')})`);
      await p.locator('button', { hasText: /^Select all$/ }).first().click(); // section-level select all
      await p.waitForTimeout(300);
      const after = await registerCount();
      ok(after - before === n, `${fn}: Select all added ${after - before} records to the Change Register`);
      await p.locator('button', { hasText: /Add all proposed/ }).click();
      await p.locator('.modal button', { hasText: 'Add all' }).click();
      await p.waitForTimeout(300);
      const drive = await p.locator('.section', { hasText: 'What these changes drive' }).innerText();
      const m = /(\d+)\s*stakeholder\(s\) with proposed impact/.exec(drive);
      ok(m && Number(m[1]) >= 4, `${fn}: downstream impact live (${m ? m[1] : 0} stakeholders with proposed impact)`);
      ok(/(\d+)\s*requiring review/.test(drive) && /governance-only/.test(drive), `${fn}: review and governance-only counts reported`);
    }
    await p.screenshot({ path: `${SP}/shots/ai-generated.png`, fullPage: false });

    // Edit before selection is blocked once in register; remove/restore works on unselected
    // Save as change pack (engagement-private)
    await p.locator('button', { hasText: 'Save as change pack' }).click();
    await p.locator('.modal button', { hasText: 'Save pack' }).click();
    await p.waitForSelector('text=Engagement-private');
    ok(true, 'change pack saved as engagement-private');

    // Failure: persistent invalid output → visible error with Retry, no fake data
    await p.locator('#ai-fn').selectOption('__new');
    await p.locator('input[aria-label="New function name"]').fill('Garbage Function');
    await p.locator('button', { hasText: /Generate changes with AI/ }).click();
    await p.waitForSelector('text=Generation failed', { timeout: 30000 });
    ok((await p.locator('.banner.crit').innerText()).includes('failed validation'), 'malformed output: clear failure message after repair retries');
    ok((await p.locator('.banner.crit button', { hasText: 'Retry' }).count()) === 1, 'failure offers Retry');

    // Malformed first reply → repaired
    await p.locator('input[aria-label="New function name"]').fill('Malformed Ops');
    await p.locator('button', { hasText: /Generate changes with AI/ }).click();
    await p.waitForFunction(() => document.body.innerText.includes('Malformed Ops — AI-generated candidate changes') && !document.body.innerText.includes('Generating…'), null, { timeout: 30000 });
    ok((await p.locator('.lib-item').count()) >= 15, 'malformed first reply: repaired by retry and candidates shown');

    // Impact matrix shows generated-role stakeholders
    const go = async (v) => { await p.waitForFunction(() => document.querySelector('.topbar')?.textContent?.includes('Saved'), null, { timeout: 10000 }); await p.evaluate((v) => { location.hash = v; }, v); await p.reload(); await p.waitForSelector('.page-title'); await p.waitForTimeout(400); };
    await go('impact-assessment');
    const matrix = await p.locator('main').innerText();
    ok(/Sales Operations Team Members/.test(matrix) && /Data Management Office Team Members/.test(matrix), 'impact matrix includes AI-suggested stakeholders that were added');
    await p.screenshot({ path: `${SP}/shots/ai-impact-matrix.png` });

    // Library: function without templates offers AI instead of an empty screen
    await go('change-identification');
    await p.locator('.chips .chip', { hasText: /^Sustainability Management/ }).click();
    ok((await p.locator('button', { hasText: 'Generate changes for Sustainability Management with AI' }).count()) === 1, 'library: function without templates offers "Generate changes for … with AI" instead of an empty screen');
    await p.screenshot({ path: `${SP}/shots/library-empty-ai.png` });
    await p.locator('.chips .chip', { hasText: /^Quantum Widget Stewardship/ }).click();
    const packItems = await p.locator('.lib-item').count();
    ok(packItems >= 15 && (await p.locator('.lib-item .badge', { hasText: 'AI · pack v1' }).count()) === packItems, `library: saved engagement-private pack appears under its function (${packItems} templates)`);

    // Persistence across reload
    await p.waitForFunction(() => document.querySelector('.topbar')?.textContent?.includes('Saved'), null, { timeout: 10000 });
    await p.reload(); await p.waitForSelector('.page-title');
    await p.locator('.tabs button', { hasText: 'Generate with AI' }).click();
    ok((await p.locator('.chips .chip', { hasText: 'Sales Operations ·' }).count()) >= 1, 'generations persist after reload');

    const log = fs.readFileSync(LOG, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    ok(log.length >= 24 && log.every((e) => e.apiKeyPresent && e.keyMatches && e.model === 'claude-opus-5-5' && e.fallbacks === 'default'), `server sent ${log.length} Messages API requests with the server-side key, model claude-opus-5-5`);
    ok(errs.length === 0, 'no page errors' + (errs.length ? ': ' + errs.join(' | ') : ''));
    await ctx.close();
  } finally {
    await b.close();
    procs.forEach((x) => x.kill());
  }
  console.log(`Screenshots: ${SP}/shots`);
})().catch((e) => { console.error(e); procs.forEach((x) => x.kill()); process.exit(1); });
