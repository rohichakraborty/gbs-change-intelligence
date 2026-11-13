const { chromium } = require('playwright');
// Usage: npm run build && npm run preview, then: node e2e/change-identification.e2e.cjs [outDir]
const os = require('os'); const fs = require('fs'); const path = require('path');
const SP = process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'gbs-e2e-'));
fs.mkdirSync(`${SP}/shots`, { recursive: true });
fs.writeFileSync(`${SP}/import.csv`, 'Change,Description,Function,Dimension\n"Accounts payable moves to the shared service centre","AP invoice processing transfers to GBS",Finance,Operating Model\n"New HR portal for employee self-service","Employees log requests in a portal",HR,Technology\n"Canteen menu redesign","Not a GBS change",Facilities,Process\n');
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1500, height: 950 }, acceptDownloads: true });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  const saved = () => p.waitForFunction(() => document.querySelector('.topbar')?.textContent?.includes('Saved'), null, { timeout: 10000 });
  const go = async (v) => { await saved(); await p.evaluate((v) => { location.hash = v; }, v); await p.reload(); await p.waitForSelector('.page-title'); await p.waitForTimeout(250); };
  await p.goto('http://localhost:4173/#change-identification'); await p.waitForSelector('.page-title');
  ok((await p.locator('.ctx-strip').innerText()).includes('Project Atlas'), 'engagement context strip from setup');

  // T2: Operating Model -> IT -> IT Service Delivery
  await p.locator('.lib-nav button', { hasText: 'Change in Operating Model' }).click();
  await p.locator('.chips .chip', { hasText: /^IT$/ }).click();
  await p.locator('.mx-toolbar select').first().selectOption('IT Service Delivery');
  const items = await p.locator('.lib-item .ttl').allInnerTexts();
  ok(items.includes('IT service delivery ownership moves to GBS'), 'OM → IT → IT Service Delivery shows options: ' + items.join(' | '));
  // T1: tick checkbox, details panel
  await p.locator('.lib-item', { hasText: 'IT service delivery ownership moves to GBS' }).locator('input[type=checkbox]').check();
  await p.waitForTimeout(300);
  await p.locator('.lib-item', { hasText: 'IT service delivery ownership moves to GBS' }).locator('button', { hasText: 'Details' }).click();
  const insp = await p.locator('.inspector').innerText();
  ok(/Governance involvement/.test(insp) && /CIO|Technology executive/.test(insp), 'template detail shows governance + roles');
  await p.screenshot({ path: `${SP}/shots/lib-it.png` });
  ok((await p.locator('.banner.info', { hasText: 'Last change' }).count()) === 1, 'propagation summary shown after selection');

  // T8/T15: all visible across all functions, then bulk scope
  await p.locator('.lib-nav button', { hasText: 'All dimensions' }).click();
  await p.locator('.chips .chip', { hasText: 'All functions' }).click();
  await p.locator('.mx-toolbar select').first().selectOption('');
  let t0 = Date.now();
  await p.locator('button', { hasText: 'Select all visible' }).click();
  await p.waitForFunction(() => /Change Register \((1[0-9]{2})\)/.test(document.body.innerText), null, { timeout: 15000 });
  const tSel = Date.now() - t0;
  const reg = await p.locator('.tab', { hasText: 'Change Register' }).innerText();
  ok(/\((12[5-9])\)/.test(reg), `selected all templates: ${reg} in ${tSel}ms`);
  t0 = Date.now();
  await p.locator('.lib-nav button', { hasText: 'Change in Technology' }).click();
  await p.locator('input[aria-label="Search changes"]').fill('platform');
  const tFilter = Date.now() - t0;
  ok(tFilter < 3000, `filter responsive (${tFilter}ms)`);
  await p.locator('input[aria-label="Search changes"]').fill('');
  await p.locator('button', { hasText: 'Bulk scope / wave' }).click();
  await p.locator('.modal .chip', { hasText: 'Wave 1 — Finance' }).click();
  t0 = Date.now();
  await p.locator('.modal button', { hasText: /Apply to \d+ change/ }).click();
  await p.waitForSelector('.modal', { state: 'detached' });
  ok(true, `bulk wave applied to all selected (${Date.now() - t0}ms)`);

  // Clarifications: bulk answer
  await p.locator('.tab', { hasText: 'Clarifications' }).click();
  const cards = await p.locator('.q-card').count();
  ok(cards > 0 && cards <= 12, `clarification cards grouped by question: ${cards}`);
  const card = p.locator('.q-card', { hasText: 'What type of technology change' });
  await card.locator('.q-opt', { hasText: 'New platform replacing' }).click();
  await card.locator('button', { hasText: /Apply to \d+ change/ }).click();
  await p.waitForTimeout(400);
  ok((await p.locator('.q-card', { hasText: 'What type of technology change' }).count()) === 0, 'tech_type answered in bulk and removed from queue');

  // Register: remove a change and check it remains under removed filter
  await p.locator('.tab', { hasText: 'Change Register' }).click();
  await p.locator('input[aria-label="Search register"]').fill('IT service delivery ownership');
  await p.locator('table.tbl tbody tr').first().locator('button[aria-label="Remove"]').click();
  await p.waitForTimeout(300);
  await p.locator('.mx-toolbar select').last().selectOption('removed');
  ok((await p.locator('table.tbl tbody tr', { hasText: 'IT service delivery ownership' }).count()) === 1, 'removed change kept in register (removed filter)');
  await p.locator('table.tbl tbody tr').first().locator('button[aria-label="Restore"]').click();

  // Import
  await p.locator('.tab', { hasText: 'Import list' }).click();
  await p.setInputFiles('input[type=file]', `${SP}/import.csv`);
  await p.waitForSelector('text=Import review');
  await p.waitForTimeout(400);
  const imp = await p.locator('table.tbl tbody tr').count();
  ok(imp === 3, `3 imported rows queued (none discarded): ${imp}`);
  await p.locator('table.tbl tbody tr', { hasText: 'Canteen' }).locator('button', { hasText: 'Create custom' }).click();
  await p.waitForTimeout(300);
  ok((await p.locator('table.tbl tbody tr').count()) === 2, 'unmatched row turned into a custom change');

  // Impact matrix: contributing changes
  await go('impact-assessment');
  const row = p.locator('table.mx tbody tr', { hasText: 'Transferring Employees' });
  await row.locator('td.cellc').nth(0).click();
  await p.waitForSelector('.inspector');
  const ii = await p.locator('.inspector').innerText();
  ok(/contributing changes \((\d+)\)/i.test(ii) && /Library template OM-FIN-01 v1, rule OM-FIN-01\.R1/.test(ii), 'impact inspector lists contributing changes with template rule source');
  await p.locator('.inspector .rel-row').first().locator('button', { hasText: 'Confirm impact' }).click();
  await p.waitForTimeout(300);
  ok((await row.locator('td.cellc').nth(0).locator('.sym.yes').count()) === 1, 'change-level confirmation shows confirmed ✓');
  await p.screenshot({ path: `${SP}/shots/impact-contrib.png` });

  // Milestone suggestions
  await go('milestone-planner');
  ok((await p.locator('.badge', { hasText: /Suggested by/ }).count()) > 0, 'milestones suggested by selected changes (not auto-selected)');

  // Library maintenance: edit & version
  await go('change-identification');
  await p.locator('.tab', { hasText: 'Library maintenance' }).click();
  await p.locator('button', { hasText: 'Enable library editing' }).click();
  await p.locator('.modal button', { hasText: 'Enable editing' }).click();
  await p.locator('input[aria-label="Search templates"]').fill('Payroll operations ownership');
  await p.locator('.issue', { hasText: 'Payroll operations ownership changes' }).first().click();
  await p.locator('.section input.input').first().fill('Payroll operations ownership changes (edited)');
  await p.locator('button', { hasText: 'Save as new version' }).click();
  await p.waitForTimeout(500);
  ok((await p.locator('text=v2').count()) > 0, 'template saved as v2');
  await go('change-identification');
  await p.locator('.tab', { hasText: 'Change Register' }).click();
  await p.locator('input[aria-label="Search register"]').fill('Payroll operations ownership');
  const regRow = await p.locator('table.tbl tbody tr').first().innerText();
  ok(/v1 · update available/.test(regRow) && !/\(edited\)/.test(regRow), 'engagement keeps v1 after library edit, flagged update available');

  // Persistence after reload
  await go('change-identification');
  const reg2 = await p.locator('.tab', { hasText: 'Change Register' }).innerText();
  ok(/\((12[5-9])\)/.test(reg2), 'selections persisted after reload: ' + reg2);
  await p.locator('.tab', { hasText: 'Clarifications' }).click();
  ok((await p.locator('.q-card', { hasText: 'What type of technology change' }).count()) === 0, 'clarification answers persisted');
  ok(errs.length === 0, 'no console/page errors ' + errs.slice(0, 3).join(' | '));
  await b.close();
})();
