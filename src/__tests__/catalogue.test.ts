import { describe, it, expect, beforeEach } from 'vitest';
import { BUILTIN_TEMPLATES } from '../catalogue/templates';
import { QUESTIONS } from '../catalogue/questions';
import { getTemplate } from '../catalogue/registry';
import { ARCHETYPE_LABELS, CHANNEL_LIBRARY, MILESTONE_LIBRARY } from '../domain/library';
import { createBlankState, commFromRec } from '../domain/factory';
import { createDemoState } from '../domain/demo';
import { migrateState } from '../domain/migrate';
import type { EngagementState } from '../domain/types';
import { derive } from '../engine/derive';
import { useApp } from '../store/store';
import { setTemplatesSelected, setClarification, updateChanges, setChangeDecision } from '../store/changeActions';
import { setImpactDecision, setCommStatus, acceptSuggestions } from '../store/actions';

const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));

/** Blank engagement with IT/Finance functions and a set of stakeholders. */
function itEngagement(): EngagementState {
  const s = createBlankState('IT test');
  s.engagement.functions = [{ id: 'f1', name: 'IT', approach: 'Lift-and-shift' }, { id: 'f2', name: 'Finance & Accounting', approach: 'Lift-and-shift' }];
  s.waves[0].goLiveDate = '2027-06-01';
  s.waves[0].functions = ['IT'];
  const sel = (key: string, patch: Record<string, unknown> = {}) => Object.assign(s.stakeholders.find((x) => x.libraryKey === key)!, { selected: true }, patch);
  sel('cio'); sel('cdo'); sel('cfo'); sel('gbs_head'); sel('it'); sel('business_users'); sel('not_impacted'); sel('data_governance_lead');
  sel('function_head', { roleName: 'IT Service Delivery Lead', functionName: 'IT' });
  sel('transferring', { roleName: 'Transferring AP staff', functionName: 'Finance & Accounting' });
  return s;
}
const st = (s: EngagementState, name: string) => s.stakeholders.find((x) => x.roleName === name)!;
const cell = (s: EngagementState, stName: string, dim: string) => derive(s).impacts.get(`${st(s, stName).id}|${dim}`)!;

beforeEach(() => { useApp.setState({ current: itEngagement(), past: [], future: [], persistence: null }); });
const S = () => useApp.getState().current!;

describe('Change Library catalogue', () => {
  it('T3: at least 100 distinct, valid templates across five dimensions', () => {
    expect(BUILTIN_TEMPLATES.length).toBeGreaterThanOrEqual(100);
    expect(new Set(BUILTIN_TEMPLATES.map((t) => t.templateId)).size).toBe(BUILTIN_TEMPLATES.length);
    expect(new Set(BUILTIN_TEMPLATES.map((t) => t.title.toLowerCase())).size).toBe(BUILTIN_TEMPLATES.length);
    expect(new Set(BUILTIN_TEMPLATES.map((t) => t.description)).size).toBe(BUILTIN_TEMPLATES.length);
    for (const d of ['OM', 'PR', 'OS', 'TE', 'IM']) expect(BUILTIN_TEMPLATES.filter((t) => t.primaryChangeDimension === d).length).toBeGreaterThanOrEqual(15);
    const msKeys = new Set(MILESTONE_LIBRARY.map((m) => m.key)), chIds = new Set(CHANNEL_LIBRARY.map((c) => c.id));
    for (const t of BUILTIN_TEMPLATES) {
      expect(t.rules.some((r) => r.kind === 'direct'), t.templateId).toBe(true);
      for (const r of t.rules) for (const role of r.roles) expect(role === '$cxo' || role in ARCHETYPE_LABELS, `${t.templateId} ${role}`).toBe(true);
      for (const r of t.rules) if (r.when) expect(QUESTIONS[r.when.q], `${t.templateId} ${r.when.q}`).toBeTruthy();
      for (const q of t.clarificationQuestions) expect(QUESTIONS[q], `${t.templateId} ${q}`).toBeTruthy();
      for (const k of t.typicalMilestoneTriggers) expect(msKeys.has(k), `${t.templateId} ${k}`).toBe(true);
      for (const c of t.suggestedChannels) expect(chIds.has(c), `${t.templateId} ${c}`).toBe(true);
      expect(t.typicalAsIs && t.typicalToBe && t.description).toBeTruthy();
      expect(t.clarificationQuestions.length).toBeLessThanOrEqual(4);
    }
  });
  it('T2: hierarchy Operating Model → IT → IT Service Delivery has options', () => {
    const hits = BUILTIN_TEMPLATES.filter((t) => t.primaryChangeDimension === 'OM' && t.functionTags.includes('IT') && t.processTags.includes('IT Service Delivery'));
    expect(hits.map((t) => t.title)).toContain('IT service delivery ownership moves to GBS');
  });
});

describe('Selection → Change Register → Impact engine', () => {
  it('T1/T4: five checkbox selections create five structured records, no duplicates', () => {
    const ids = ['OM-IT-01', 'OM-IT-02', 'PR-IT-01', 'TE-IT-01', 'IM-IT-01'];
    expect(setTemplatesSelected(ids, true).added).toBe(5);
    expect(setTemplatesSelected(ids, true).added).toBe(0); // re-selecting does nothing
    const ch = S().changes.filter((c) => c.active);
    expect(ch.length).toBe(5);
    expect(new Set(ch.map((c) => c.code)).size).toBe(5);
    const c = ch.find((x) => x.templateId === 'OM-IT-01')!;
    expect(c).toMatchObject({ source: 'template', templateVersion: 1, dimensionId: 'dim_om', functionName: 'IT', status: 'draft', defaultsReviewed: false });
    expect(c.asIs && c.toBe && c.description).toBeTruthy();
    expect(c.waveIds).toEqual([S().waves[0].id]); // wave inferred from wave functions
  });

  it('T5/T6: IT service delivery transfer — IT roles impacted, CIO governance only, CDO depends on clarification', () => {
    setTemplatesSelected(['OM-IT-01'], true);
    const s = S();
    expect(cell(s, 'IT Service Delivery Lead', 'dim_om').classification).toBe('impacted');
    expect(cell(s, 'IT', 'dim_om').classification).toBe('impacted');
    expect(cell(s, 'Global GBS Head', 'dim_om').classification).toBe('impacted');
    expect(cell(s, 'Business Users', 'dim_im').classification).toBe('impacted');
    const cio = cell(s, 'CIO / CTO', 'dim_om');
    expect(cio.classification).toBe('not_impacted');
    expect(cio.governanceChangeIds.length).toBe(1);
    expect(cell(s, 'CDO', 'dim_om').classification).toBe('review'); // unanswered data_scope
    expect(cell(s, 'Transferring AP staff', 'dim_om').classification).toBe('not_impacted'); // Finance staff, IT change
    expect(cell(s, 'Employees not directly impacted', 'dim_om').classification).not.toBe('impacted');
    const id = S().changes[0].id;
    setClarification([id], 'data_scope', 'no');
    expect(cell(S(), 'CDO', 'dim_om').classification).toBe('not_impacted');
    setClarification([id], 'data_scope', 'yes');
    expect(cell(S(), 'CDO', 'dim_om').classification).toBe('impacted');
    expect(cell(S(), 'CIO / CTO', 'dim_om').classification).toBe('not_impacted');
  });

  it('T7: technology clarification materially changes stakeholder impacts', () => {
    setTemplatesSelected(['TE-ENT-01'], true);
    const id = S().changes[0].id;
    expect(cell(S(), 'Business Users', 'dim_te').classification).toBe('review');
    setClarification([id], 'tech_type', 'replace');
    expect(cell(S(), 'Business Users', 'dim_te').classification).toBe('impacted');
    expect(cell(S(), 'IT', 'dim_te').classification).toBe('impacted');
    setClarification([id], 'tech_type', 'ownership');
    expect(cell(S(), 'Business Users', 'dim_te').classification).toBe('not_impacted');
    expect(cell(S(), 'IT', 'dim_om').classification).toBe('impacted'); // support ownership moves
  });

  it('T8/T15: select 100+ templates, bulk assign scope, stays fast', () => {
    const ids = BUILTIN_TEMPLATES.map((t) => t.templateId);
    let t0 = performance.now();
    setTemplatesSelected(ids, true);
    const tSelect = performance.now() - t0;
    expect(S().changes.filter((c) => c.active).length).toBe(ids.length);
    t0 = performance.now(); derive(S()); const tFull = performance.now() - t0;
    const all = S().changes.map((c) => c.id);
    t0 = performance.now();
    updateChanges(all, { waveIds: [S().waves[0].id], geography: 'Global' }, 'Bulk scope');
    const tBulk = performance.now() - t0;
    expect(S().changes.every((c) => c.waveIds[0] === S().waves[0].id && c.geography === 'Global')).toBe(true);
    // incremental: one change edit
    t0 = performance.now(); setClarification([all[0]], 'employment_effect', 'transfer'); derive(S()); const tOne = performance.now() - t0;
    console.log({ templates: ids.length, tSelect: Math.round(tSelect), tFull: Math.round(tFull), tBulk: Math.round(tBulk), tOneEdit: Math.round(tOne) });
    expect(tSelect + tBulk).toBeLessThan(6000);
    expect(tOne).toBeLessThan(1500);
  });

  it('T10: every rule-proposed impact traces to an active selected change and a template rule', () => {
    setTemplatesSelected(BUILTIN_TEMPLATES.slice(0, 40).map((t) => t.templateId), true);
    const s = S(); const d = derive(s);
    let n = 0;
    for (const rec of d.impactRecs.values()) for (const p of rec.pairs) {
      if (p.hit !== 'direct' && p.hit !== 'indirect') continue;
      const c = s.changes.find((x) => x.id === p.changeId)!;
      expect(c.active).toBe(true);
      expect(getTemplate(c.templateId, c.templateVersion, s)!.ruleIds).toContain(p.ruleId);
      n++;
    }
    expect(n).toBeGreaterThan(20);
  });

  it('T11/T14: deselection recalculates drafts but keeps consultant decisions and approved comms (flagged)', () => {
    setTemplatesSelected(['OM-IT-01', 'OM-IT-02'], true);
    const s0 = S();
    const lead = st(s0, 'IT Service Delivery Lead');
    const itOps = st(s0, 'IT');
    setImpactDecision(lead.id, 'dim_om', { classification: 'impacted', directness: 'direct', severity: null, rationale: 'Confirmed in workshop' }, 'confirmed', 'test');
    const c1 = S().changes.find((c) => c.templateId === 'OM-IT-01')!;
    setChangeDecision(itOps.id, c1.id, 'dim_om', { classification: 'impacted', directness: 'direct', rationale: 'Confirmed' });
    expect(cell(S(), 'IT', 'dim_om').confirmed).toBe(true);
    // Build plan + approve one communication to the business users
    useApp.getState().patchCurrent((d) => { d.milestones.find((m) => m.libraryKey === 'golive')!.selected = true; });
    acceptSuggestions(derive(S()).suggestions.map((x) => x.key));
    const comm = derive(S()).activeComms.find((c) => c.audience.roleName === 'Business Users')!;
    expect(comm).toBeTruthy();
    expect(setCommStatus(comm.rec.id, 'confirmed')).toBeNull();
    setTemplatesSelected(['OM-IT-01', 'OM-IT-02'], false);
    const s1 = S(); const d1 = derive(s1);
    expect(s1.changes.every((c) => !c.active)).toBe(true);
    expect(s1.changes.length).toBe(2); // kept, not deleted
    expect(cell(s1, 'IT Service Delivery Lead', 'dim_om').classification).toBe('impacted'); // cell decision preserved
    expect(s1.changeAssessments[`${itOps.id}|${c1.id}|dim_om`]).toBeTruthy(); // change-level decision preserved
    expect(cell(s1, 'Business Users', 'dim_im').classification).not.toBe('impacted'); // draft recalculated
    const kept = d1.commById.get(comm.rec.id)!;
    expect(kept.rec.status).toBe('confirmed'); // not deleted or changed
    expect(kept.upstreamChanged || d1.suggestions.some((x) => x.kind === 'remove' && x.commId === comm.rec.id)).toBe(true); // flagged
    expect(s1.lastPropagation?.action).toMatch(/Deselected/);
  });

  it('T13: selecting changes propagates into draft audience recommendations', () => {
    const s0 = S();
    useApp.getState().patchCurrent((d) => { d.milestones.find((m) => m.libraryKey === 'golive')!.selected = true; d.milestones.find((m) => m.libraryKey === 'impacted_comms')!.selected = true; });
    const before = derive(S()).audienceRecs.size;
    setTemplatesSelected(['OM-FIN-01', 'OS-ENT-01'], true);
    const d = derive(S());
    expect(d.audienceRecs.size).toBeGreaterThan(before);
    const ap = [...d.audienceRecs.values()].find((r) => r.stakeholderId === st(S(), 'Transferring AP staff').id);
    expect(ap?.changeIds.length).toBeGreaterThan(0);
    expect(d.suggestedMilestones.size).toBeGreaterThan(0);
    void s0;
  });
});

describe('Existing data (T12) and persistence shape (T16)', () => {
  it('migrates a v1 engagement with manual changes and keeps impacts working', () => {
    const v1 = clone(createDemoState()) as unknown as Record<string, unknown>;
    // simulate an old save: drop v2 fields
    delete v1.changeAssessments; delete v1.templateSnapshots; delete v1.importQueue; delete v1.lastPropagation;
    v1.schemaVersion = 1;
    const changes = v1.changes as Record<string, unknown>[];
    changes.push({ id: 'old1', code: 'CHG-900', dimensionId: 'dim_os', title: 'AP employees transfer into GBS', description: '', asIs: 'Local reporting', toBe: 'GBS reporting',
      notChanging: '', rationale: '', functionName: 'Finance & Accounting', geography: '', process: '', effectiveDate: null, milestoneId: null, waveIds: [], peopleAffected: 10,
      owner: '', operationalImpact: '', behaviouralImpact: '', dependencies: '', assumptions: '', evidence: '', status: 'confirmed' });
    for (const c of changes) for (const k of ['source', 'templateId', 'templateVersion', 'active', 'functionTags', 'processTags', 'entities', 'clarificationAnswers', 'scopeOverrides', 'customDescription', 'defaultsReviewed', 'selectedAt', 'lastModifiedAt']) if (c.id === 'old1') delete c[k];
    const m = migrateState(v1 as unknown as EngagementState);
    expect(m.schemaVersion).toBe(2);
    const old = m.changes.find((c) => c.id === 'old1')!;
    expect(old).toMatchObject({ source: 'custom', active: true, functionTags: ['Finance & Accounting'] });
    const d = derive(m);
    const tr = m.stakeholders.find((x) => x.roleName.startsWith('Transferring'))!;
    expect(d.impactRecs.get(`${tr.id}|dim_os`)!.changeIds).toContain('old1');
    expect(migrateState(m)).toBe(m); // idempotent
    const round = migrateState(JSON.parse(JSON.stringify(m)));
    expect(round.changes.length).toBe(m.changes.length);
  });
  it('demo engagement is template-based with explainable recommendations', () => {
    const s = createDemoState();
    const d = derive(s);
    expect(s.changes.filter((c) => c.source === 'template').length).toBeGreaterThanOrEqual(20);
    expect(d.clarificationQueue.length).toBeGreaterThan(0);
    const counts = [...d.impacts.values()].reduce((a, v) => ({ ...a, [v.classification]: (a[v.classification] ?? 0) + 1 }), {} as Record<string, number>);
    console.log('demo cells', counts, 'comms', d.comms.length, 'issues', d.issues.length);
    expect(counts.impacted).toBeGreaterThan(20);
    expect(counts.not_impacted).toBeGreaterThan(10);
    void commFromRec;
  });
});
