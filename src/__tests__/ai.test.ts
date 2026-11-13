import { describe, it, expect, beforeEach, beforeAll, afterAll } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { readFileSync, rmSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { createDemoState } from '../domain/demo';
import type { EngagementState } from '../domain/types';
import { derive } from '../engine/derive';
import { useApp } from '../store/store';
import { addRolesAsStakeholders, runGeneration, runDimension, selectCandidates, savePack, mapRole } from '../store/aiActions';
import { setImpactDecision, acceptSuggestions } from '../store/actions';
import { AIError, type LLMProvider, type LLMRequest } from '../ai/providers';
import { roleKey, roleSimilarity, matchRole } from '../ai/roles';
import { getTemplate } from '../catalogue/registry';
// Test doubles (not models): see test/synthetic-llm.mjs and test/fixtures/sales-ops.mjs
// @ts-expect-error plain ESM test helper
import { respond } from '../../test/synthetic-llm.mjs';
// @ts-expect-error plain ESM test helper
import { salesRespond } from '../../test/fixtures/sales-ops.mjs';

const requests: LLMRequest[] = [];
const testProvider = (fn: (user: string) => string = (u) => respond('', u)): LLMProvider => ({
  id: 'test', label: 'TEST DOUBLE (synthetic)',
  async complete(r) { requests.push(r); try { return { text: fn(r.user), model: 'synthetic-test-double', truncated: false }; } catch (e) { throw new AIError('upstream', (e as Error).message, true); } },
});
const S = () => useApp.getState().current!;
beforeEach(() => { requests.length = 0; useApp.setState({ current: createDemoState(), past: [], future: [], persistence: null }); });
// Resolve a role name via the role register (AI role may be mapped onto an existing stakeholder), else by stakeholder name.
const stIdOf = (s: EngagementState, name: string) => s.roleSuggestions.find((r) => r.role === name && r.stakeholderId)?.stakeholderId ?? s.stakeholders.find((x) => x.roleName === name)!.id;
const cellOf = (s: EngagementState, stName: string, dim: string) => derive(s).impacts.get(`${stIdOf(s, stName)}|${dim}`);
const aiPairs = (s: EngagementState, stName: string, dim: string) => (derive(s).impactRecs.get(`${stIdOf(s, stName)}|${dim}`)?.pairs ?? []).filter((p) => p.ruleId.startsWith('AI-'));

const FUNCTIONS = ['Finance & Accounting', 'Human Resources', 'IT', 'Sales Operations', 'Sustainability Management', 'Data Management Office', 'Quantum Widget Stewardship'];

describe('AI generation pipeline — every function (synthetic test double)', () => {
  for (const fn of FUNCTIONS) {
    it(`${fn}: generate → validate → select → register → roles → impact → audience`, async () => {
      const approvedSt = S().stakeholders.find((x) => x.roleName.startsWith('Transferring'))!;
      setImpactDecision(approvedSt.id, 'dim_om', { classification: 'impacted', directness: 'direct', severity: null, rationale: 'Approved earlier' }, 'confirmed', 'pre-existing approval');
      const genId = await runGeneration(testProvider(), { function: fn, functionDescription: '', processes: [], technologies: [], documentExcerpt: '' });
      let g = S().aiGenerations.find((x) => x.id === genId)!;
      // function created/selected in engagement
      expect(S().engagement.functions.some((f) => f.name === fn)).toBe(true);
      // request construction
      const rolesReq = requests.find((r) => r.purpose === 'roles')!;
      expect(rolesReq.user).toContain(`"selectedFunction": "${fn}"`);
      expect(rolesReq.user).toContain('New GBS setup');
      expect(rolesReq.user).toContain('Wave 1 — Finance');
      expect(rolesReq.system).toMatch(/GBS\/GCC transformation and Change Management consultant/);
      expect(requests.filter((r) => r.purpose.startsWith('changes:')).length).toBe(5);
      // structured, validated, de-duplicated output
      expect(g.status).toBe('complete');
      expect(g.steps.every((st) => st.status === 'ok')).toBe(true);
      expect(g.steps.find((st) => st.key === 'OM')!.rejected.length).toBe(1); // malformed record rejected
      expect(g.steps.every((st) => st.key === 'roles' || st.duplicates >= 1)).toBe(true); // in-batch duplicate removed
      for (const d of ['OM', 'PR', 'OS', 'TE', 'IM']) expect(g.candidates.filter((c) => c.dim === d).length).toBeGreaterThanOrEqual(3);
      expect(new Set(g.candidates.map((c) => c.template.title)).size).toBe(g.candidates.length);
      // roles suggested and compared with the register
      const rs = S().roleSuggestions.filter((r) => r.generationId === genId);
      expect(rs.length).toBeGreaterThanOrEqual(7);
      expect(rs.find((r) => r.role === 'GBS Head')?.status).toBe('mapped'); // exact equivalent auto-mapped
      expect(rs.filter((r) => r.status === 'proposed').length).toBeGreaterThan(3); // others need confirmation
      // select all candidates → structured register records
      selectCandidates(g.candidates.map((c) => c.id), true);
      const recs = S().changes.filter((c) => c.active && c.templateId?.startsWith('AI-'));
      expect(recs.length).toBe(g.candidates.length);
      expect(recs.every((c) => c.source === 'template' && c.functionTags.includes(fn) && c.status === 'draft' && /AI-generated/.test(c.assumptions) && /Not client evidence/.test(c.evidence))).toBe(true);
      expect(new Set(recs.map((c) => c.code)).size).toBe(recs.length);
      // add proposed roles → impacts appear, executives not blanket-impacted
      addRolesAsStakeholders(S().roleSuggestions.filter((r) => r.status === 'proposed' && r.generationId === genId).map((r) => r.key));
      const s1 = S();
      expect(cellOf(s1, `${fn} Team Members`, 'dim_om')?.classification).toBe('impacted');
      expect(cellOf(s1, `Head of ${fn}`, 'dim_pr')?.classification).toBe('impacted');
      expect(aiPairs(s1, `Chief ${fn} Officer`, 'dim_om').every((p) => p.hit === 'governance')).toBe(true);
      expect(aiPairs(s1, `Chief ${fn} Officer`, 'dim_om').length).toBeGreaterThan(0);
      expect(cellOf(s1, 'Chief Data Officer', 'dim_te')?.classification).toBe('review');
      expect(cellOf(s1, `Business Users of ${fn}`, 'dim_im')?.classification).toBe('impacted');
      // every AI-derived impact traces to a selected change and rule
      for (const rec of derive(s1).impactRecs.values()) for (const p of rec.pairs) if ((p.hit === 'direct' || p.hit === 'indirect') && p.ruleId.startsWith('AI-')) {
        const c = s1.changes.find((x) => x.id === p.changeId)!;
        expect(getTemplate(c.templateId, c.templateVersion, s1)!.ruleIds).toContain(p.ruleId);
      }
      // downstream: audience recommendations include new stakeholders
      const d1 = derive(s1);
      const teamMembers = s1.stakeholders.find((x) => x.id === stIdOf(s1, `${fn} Team Members`))!;
      expect([...d1.audienceRecs.values()].some((r) => r.stakeholderId === teamMembers.id)).toBe(true);
      expect(d1.suggestions.some((x) => x.stakeholderId === teamMembers.id)).toBe(true);
      acceptSuggestions(d1.suggestions.filter((x) => x.stakeholderId === teamMembers.id).map((x) => x.key));
      const comm = derive(S()).activeComms.find((c) => c.audience.id === teamMembers.id)!;
      expect(comm.roles.primary).toBeTruthy();
      expect(comm.channels.primary).toBeTruthy();
      expect(comm.brief.whatIsChanging.length).toBeGreaterThan(0);
      // existing approval preserved
      expect(cellOf(S(), approvedSt.roleName, 'dim_om')?.source).toBe('consultant');
      g = S().aiGenerations.find((x) => x.id === genId)!;
      expect(g.candidates.length).toBeGreaterThan(0);
    });
  }
});

describe('Interpretation of realistic content (hand-written Sales Operations fixture)', () => {
  it('CRM workflow automation: reps and CRM admin impacted, CSO governance only, CDO requires review', async () => {
    const genId = await runGeneration(testProvider(salesRespond), { function: 'Sales Operations', functionDescription: 'Order management, CRM and pipeline reporting', processes: ['Order Management', 'CRM'], technologies: ['CRM'], documentExcerpt: '' });
    const g = S().aiGenerations.find((x) => x.id === genId)!;
    expect(g.steps.find((x) => x.key === 'PR')!.status).toBe('ok'); // an empty dimension is reported, not faked
    expect(g.candidates.filter((c) => c.dim === 'PR').length).toBe(0);
    const crm = g.candidates.find((c) => c.template.title.startsWith('CRM workflow automation'))!;
    selectCandidates([crm.id], true);
    addRolesAsStakeholders(S().roleSuggestions.filter((r) => r.status === 'proposed').map((r) => r.key));
    const s = S();
    expect(cellOf(s, 'Sales Representatives', 'dim_te')?.classification).toBe('impacted');
    expect(cellOf(s, 'CRM Administrator', 'dim_te')?.classification).toBe('impacted');
    expect(cellOf(s, 'VP Sales Operations', 'dim_te')).toMatchObject({ classification: 'impacted', directness: 'indirect' });
    // CSO: governance only from the AI change (the cell itself may still show 'review' because of an unrelated demo change)
    expect(aiPairs(s, 'Chief Sales Officer', 'dim_te').map((p) => p.hit)).toEqual(['governance']);
    expect(cellOf(s, 'Chief Data Officer', 'dim_te')?.classification).toBe('review');
    const rec = derive(s).impactRecs.get(`${s.stakeholders.find((x) => x.roleName === 'Chief Data Officer')!.id}|dim_te`)!;
    expect(rec.gaps.join(' ')).toMatch(/data governance/);
    expect(crm.template.typicalMilestoneTriggers).toEqual(expect.arrayContaining(['tech_req', 'employee_training', 'golive']));
    expect(crm.template.possibleCommunicationObjectives).toEqual(expect.arrayContaining(['train', 'inform']));
  });
});

describe('Failure handling — never a silent empty result', () => {
  const input = (fn: string) => ({ function: fn, functionDescription: '', processes: [], technologies: [], documentExcerpt: '' });
  it('malformed output is repaired by a retry with the validation error', async () => {
    const id = await runGeneration(testProvider(), input('Malformed Ops'));
    const g = S().aiGenerations.find((x) => x.id === id)!;
    expect(g.status).toBe('complete');
    expect(g.steps.find((x) => x.key === 'roles')!.attempts).toBe(2);
    expect(requests.some((r) => r.user.includes('YOUR PREVIOUS REPLY COULD NOT BE USED'))).toBe(true);
  });
  it('persistently invalid output fails clearly after the retry budget', async () => {
    await expect(runGeneration(testProvider(), input('Garbage Function'))).rejects.toMatchObject({ code: 'invalid_output' });
    const g = S().aiGenerations[0];
    expect(g.status).toBe('failed');
    expect(g.steps[0].error).toMatch(/failed validation after 3 attempt/);
    expect(S().aiLog[0]).toMatchObject({ ok: false });
  });
  it('API errors surface with the error, not empty data', async () => {
    await expect(runGeneration(testProvider(), input('Upstream Planning'))).rejects.toMatchObject({ code: 'upstream' });
    expect(S().aiGenerations[0]).toMatchObject({ status: 'failed', candidates: [] });
  });
  it('unclear and invalid function names', async () => {
    await expect(runGeneration(testProvider(), input(' 1 '))).rejects.toMatchObject({ code: 'bad_input' });
    const id = await runGeneration(testProvider(), input('Ops'));
    expect(S().aiGenerations.find((x) => x.id === id)!.clarityWarning).toMatch(/ambiguous/);
  });
  it('"Add more" avoids duplicating existing suggestions; regenerate keeps selected', async () => {
    const id = await runGeneration(testProvider(), input('Corporate Strategy'));
    const before = S().aiGenerations.find((x) => x.id === id)!.candidates.filter((c) => c.dim === 'TE');
    selectCandidates([before[0].id], true);
    await runDimension(testProvider(), id, 'TE', 'more');
    const after = S().aiGenerations.find((x) => x.id === id)!.candidates.filter((c) => c.dim === 'TE');
    expect(after.length).toBe(before.length + 2);
    expect(new Set(after.map((c) => c.template.title)).size).toBe(after.length);
    await runDimension(testProvider(), id, 'TE', 'replace');
    const rep = S().aiGenerations.find((x) => x.id === id)!.candidates.filter((c) => c.dim === 'TE');
    expect(rep.some((c) => c.id === before[0].id)).toBe(true); // selected one kept
  });
});

describe('Role matching and change packs', () => {
  it('semantic role matching proposes but does not auto-merge different titles', () => {
    expect(roleKey('VP Sales Operations')).toBe(roleKey('Head of Sales Operations'));
    expect(roleSimilarity('Sales Operations Manager', 'Head of Sales Operations')).toBeGreaterThan(0.5);
    expect(roleSimilarity('Sales Operations Manager', 'Head of Sales Operations')).toBeLessThan(1);
    const st = createDemoState().stakeholders.filter((x) => x.selected);
    expect(matchRole('Head of GBS', st)[0]?.stakeholder.roleName).toBe('GBS Head');
  });
  it('confirm-merge maps an AI role onto an existing stakeholder', async () => {
    const id = await runGeneration(testProvider(salesRespond), { function: 'Sales Operations', functionDescription: '', processes: [], technologies: [], documentExcerpt: '' });
    const om = S().aiGenerations.find((x) => x.id === id)!.candidates.find((c) => c.dim === 'OM')!;
    selectCandidates([om.id], true);
    const finHead = S().stakeholders.find((x) => x.roleName === 'Finance Function Head')!;
    mapRole(roleKey('VP Sales Operations'), finHead.id);
    expect(cellOf(S(), 'Finance Function Head', 'dim_om')?.changeIds.some((cid) => S().changes.find((c) => c.id === cid)?.templateId === om.id)).toBe(true);
  });
  it('change packs are engagement-private, versioned, de-duplicated, and selectable', async () => {
    const id = await runGeneration(testProvider(), { function: 'ESG Reporting', functionDescription: '', processes: [], technologies: [], documentExcerpt: '' });
    const ts = S().aiGenerations.find((x) => x.id === id)!.candidates.map((c) => c.template);
    const r1 = savePack('ESG Reporting Change Pack', 'ESG Reporting', [...ts, ts[0]]);
    expect(r1.skipped.length).toBe(1);
    expect(r1.pack).toMatchObject({ status: 'private', version: 1 });
    const r2 = savePack('ESG Reporting Change Pack', 'ESG Reporting', ts.slice(0, 3));
    expect(r2.pack.version).toBe(2);
    expect(S().changePacks.length).toBe(1);
    selectCandidates([r2.pack.templates[0].templateId], true);
    expect(S().changes.some((c) => c.active && c.templateId === r2.pack.templates[0].templateId && /change pack v2/.test(c.evidence))).toBe(true);
  });
});

describe('App server AI endpoint (against a local mock of the Messages API)', () => {
  let mock: ChildProcess; let base = '';
  const LOG = '/tmp/gbs-mock-anthropic.log';
  beforeAll(async () => {
    rmSync(LOG, { force: true });
    mock = spawn('node', ['test/mock-anthropic.mjs', '8799'], { env: { ...process.env, MOCK_LOG: LOG }, stdio: 'pipe' });
    await new Promise((r) => mock.stdout!.once('data', r));
    process.env.ANTHROPIC_BASE_URL = 'http://127.0.0.1:8799';
  });
  afterAll(() => { mock.kill(); });
  const start = async (key: string | undefined) => {
    if (key === undefined) delete process.env.ANTHROPIC_API_KEY; else process.env.ANTHROPIC_API_KEY = key;
    const mod = '../../server/index.mjs';
    const { createServer } = await import(/* @vite-ignore */ mod);
    const srv = createServer();
    await new Promise<void>((r) => srv.listen(0, '127.0.0.1', () => r()));
    base = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`;
    return srv;
  };
  const post = (b: unknown) => fetch(`${base}/api/ai/complete`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) });
  it('missing credentials: status not configured, requests refused with not_configured', async () => {
    const srv = await start(undefined);
    expect(await (await fetch(`${base}/api/ai/status`)).json()).toMatchObject({ configured: false });
    const r = await post({ system: 's', user: 'u', maxTokens: 1000 });
    expect(r.status).toBe(503);
    expect((await r.json()).error.code).toBe('not_configured');
    srv.close();
  });
  it('configured: builds a correct Messages request and returns text', async () => {
    const srv = await start('test-key');
    const user = respondInput();
    const r = await post({ purpose: 'roles', system: 'SYS', user, maxTokens: 16000 });
    expect(r.status).toBe(200);
    const j = await r.json();
    expect(j.model).toContain('claude-opus-5-5');
    expect(JSON.parse(j.text).roles.length).toBeGreaterThan(3);
    const last = JSON.parse(readFileSync(LOG, 'utf8').trim().split('\n').pop()!);
    expect(last).toMatchObject({ apiKeyPresent: true, keyMatches: true, model: 'claude-opus-5-5', max_tokens: 16000, effort: 'medium', fallbacks: 'default', userHasFunction: true });
    expect(last.beta).toContain('server-side-fallback-2026-07-01');
    srv.close();
  });
  it('wrong key → auth error; upstream failure → upstream error; bad input rejected', async () => {
    let srv = await start('wrong-key');
    let r = await post({ system: 's', user: respondInput(), maxTokens: 1000 });
    expect(r.status).toBe(502); expect((await r.json()).error.code).toBe('auth');
    srv.close();
    srv = await start('test-key');
    r = await post({ system: 's', user: respondInput('Upstream Planning'), maxTokens: 1000 });
    expect(r.status).toBe(502); expect((await r.json()).error.code).toBe('upstream');
    r = await post({ system: 's', user: '' });
    expect(r.status).toBe(400);
    srv.close();
  });
});

function respondInput(fn = 'Sales Operations') {
  return `TASK: ROLES_REQUEST\nENGAGEMENT CONTEXT (JSON):\n${JSON.stringify({ selectedFunction: fn }, null, 2)}`;
}
