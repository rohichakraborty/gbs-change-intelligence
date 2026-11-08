import { describe, it, expect } from 'vitest';
import { createDemoState } from '../domain/demo';
import { createBlankState } from '../domain/factory';
import { derive } from '../engine/derive';
import { generateVersion } from '../engine/artifacts';

const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));

describe('engine acceptance', () => {
  const s = createDemoState();
  const d = derive(s);

  it('demo produces comms and artifacts', () => {
    expect(d.comms.length).toBeGreaterThan(40);
    expect(s.artifacts.length).toBeGreaterThanOrEqual(4);
    console.log('comms', d.comms.length, 'artifacts', s.artifacts.length, 'issues', d.issues.length, 'suggestions', d.suggestions.length);
  });

  it('T4: impacts differ by stakeholder (not all impacted)', () => {
    const vals = [...d.impacts.values()].map((x) => x.classification);
    const counts = vals.reduce((a, v) => ({ ...a, [v]: (a[v] ?? 0) + 1 }), {} as Record<string, number>);
    console.log(counts);
    expect(counts.impacted).toBeGreaterThan(5);
    expect(counts.not_impacted).toBeGreaterThan(5);
    const st = (n: string) => d.selectedStakeholders.find((x) => x.roleName.startsWith(n))!;
    expect(d.impacts.get(`${st('Transferring').id}|dim_os`)?.classification).toBe('impacted');
    expect(d.impacts.get(`${st('CEO').id}|dim_os`)?.classification).toBe('not_impacted');
    // Finance head impacted by finance org change; HR head by HR change only
    expect(d.impactRecs.get(`${st('Finance Function Head').id}|dim_os`)?.changeIds.length).toBe(1);
    // HR tech change undocumented -> review for HR-scoped stakeholders in TE
    console.log('HR head TE', d.impacts.get(`${st('HR Function Head').id}|dim_te`));
  });

  it('T9: sensitive transfer comm uses HR and is not approved', () => {
    const v = d.comms.find((c) => c.milestone.libraryKey === 'impacted_comms' && c.audience.archetype === 'transferring')!;
    expect(v.rec.commTypeId).toBe('ct_sensitive');
    expect(v.roles.primary).toBe('cr_chro');
    expect(v.roles.approvers).toContain('cr_legal');
    expect(v.rec.status).not.toBe('approved');
    expect(v.channels.primary).toBe('ch_small_group');
    console.log('sens channels', v.channels, v.rolesRec.gaps);
  });

  it('T10: multiple channels', () => {
    const multi = d.comms.filter((c) => c.channels.secondary.length || c.channels.reinforcement || c.channels.followUp);
    expect(multi.length).toBeGreaterThan(10);
  });

  it('T13: CEO vs transferring messaging differ at go-live', () => {
    const ceo = d.comms.find((c) => c.milestone.libraryKey === 'golive' && c.audience.archetype === 'ceo');
    const tr = d.comms.find((c) => c.milestone.libraryKey === 'golive' && c.audience.archetype === 'transferring');
    console.log('golive ceo?', !!ceo, ceo?.brief.mainMessage);
    console.log('golive tr?', !!tr, tr?.brief.mainMessage);
    expect(ceo && tr).toBeTruthy();
    expect(ceo!.brief.mainMessage).not.toBe(tr!.brief.mainMessage);
  });

  it('T14: go-live change flags artifacts and moves dates', () => {
    const s2 = clone(s);
    const before = derive(s2).comms.find((c) => c.milestone.libraryKey === 'golive')!.plannedDate;
    s2.waves[0].goLiveDate = '2027-05-03';
    const d2 = derive({ ...s2 });
    const after = d2.comms.find((c) => c.milestone.libraryKey === 'golive' && c.milestone.waveId === s2.waves[0].id)!.plannedDate;
    expect(after).not.toBe(before);
    const outdated = [...d2.artifactStates.values()].filter((x) => x.outdated).length;
    console.log('outdated after date change', outdated, before, after);
    expect(outdated).toBeGreaterThan(0);
    expect([...derive(s).artifactStates.values()].filter((x) => x.outdated).length).toBe(0);
  });

  it('T15: wave-specific comms', () => {
    const w2 = s.waves[1];
    const w2c = d.comms.filter((c) => c.milestone.waveId === w2.id);
    expect(w2c.length).toBeGreaterThan(0);
    expect(w2c.every((c) => !c.audience.waveIds.length || c.audience.waveIds.includes(w2.id))).toBe(true);
    expect(w2c.some((c) => c.audience.roleName.includes('Transferring'))).toBe(false);
  });

  it('T14b: disabled channel never recommended', () => {
    const s2 = clone(s);
    s2.channels.find((c) => c.id === 'ch_townhall')!.enabled = false;
    const d2 = derive({ ...s2 });
    expect(d2.comms.some((c) => !c.channelsOverridden && [c.channels.primary, ...c.channels.secondary].includes('ch_townhall'))).toBe(false);
  });

  it('T17: placeholders, artifact text', () => {
    const v = d.comms.find((c) => c.milestone.libraryKey === 'impacted_comms' && c.audience.archetype === 'transferring')!;
    const ver = generateVersion(s, v, 'impacted_email', { v: 1, origin: 'generated', note: '' });
    const txt = ver.sections.map((x) => x.body).join('\n');
    expect(txt).toMatch(/\[CONFIRM EMPLOYEE TRANSFER DETAILS/);
    console.log(ver.meta, txt.slice(0, 600));
  });

  it('blank engagement derive works', () => {
    const b = createBlankState();
    const db = derive(b);
    expect(db.comms.length).toBe(0);
  });
});
