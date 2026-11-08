import { useState } from 'react';
import { Check, Plus, Trash2 } from 'lucide-react';
import { useApp } from '../store/store';
import type { Engagement, Wave } from '../domain/types';
import { FUNCTION_LIBRARY, TRANSFORMATION_TYPES, TRANSITION_APPROACHES } from '../domain/library';
import { uid } from '../domain/util';
import { Btn, Chips, Field, ListIn, PageHeader, Section, Select, TextIn, useConfirm, Badge } from '../ui/kit';

const STEPS = ['Basic details', 'Transformation model', 'Functions in scope', 'Implementation & waves', 'Governance', 'Available channels'];

export function EngagementSetup() {
  const s = useApp((x) => x.current)!;
  const mutate = useApp((x) => x.mutate);
  const setView = useApp((x) => x.setView);
  const toast = useApp((x) => x.toast);
  const [step, setStep] = useState(0);
  const { ask, node } = useConfirm();
  const e = s.engagement;
  const setE = <K extends keyof Engagement>(k: K, v: Engagement[K], label: string) =>
    mutate((d) => { (d.engagement as Engagement)[k] = v; }, { entityType: 'engagement', entityId: e.id, action: 'update', summary: `${label} updated` });
  const setWave = (id: string, patch: Partial<Wave>, label: string) =>
    mutate((d) => { Object.assign(d.waves.find((w) => w.id === id)!, patch); }, { entityType: 'wave', entityId: id, action: 'update', summary: label });

  const complete = [
    !!e.name && !!e.client,
    e.transformationTypes.length > 0,
    e.functions.length > 0,
    s.waves.every((w) => !!w.goLiveDate),
    e.governance.some((g) => g.personName.trim()),
    s.channels.some((c) => c.enabled),
  ];

  return (
    <>
      <PageHeader eyebrow="Stage 1 · Change Identification" title="Engagement Setup" sub="Configure the engagement context that every recommendation and deliverable is derived from."
        actions={<>
          {e.setupComplete ? <Badge tone="ok"><Check size={12} /> Setup confirmed</Badge> : <Btn variant="primary" onClick={() => { setE('setupComplete', true, 'Setup'); toast('Engagement setup confirmed'); setView('change-identification'); }}>Confirm setup and continue</Btn>}
        </>} />
      <div className="stepper">
        {STEPS.map((t, i) => (
          <button key={t} className={`step ${i === step ? 'on' : ''} ${complete[i] && i !== step ? 'done' : ''}`} onClick={() => setStep(i)}>
            <span className="n">{complete[i] && i !== step ? <Check size={12} /> : i + 1}</span>{t}
          </button>
        ))}
      </div>

      {step === 0 && (
        <Section title="Basic details">
          <div className="grid g2">
            <Field label="Engagement name" htmlFor="eng-name"><TextIn id="eng-name" value={e.name} onCommit={(v) => setE('name', v, 'Engagement name')} invalid={!e.name} /></Field>
            <Field label="Client name or pseudonym" htmlFor="eng-client" help="Use a pseudonym if the client name is confidential."><TextIn id="eng-client" value={e.client} onCommit={(v) => setE('client', v, 'Client')} /></Field>
            <Field label="Industry" htmlFor="eng-ind"><TextIn id="eng-ind" value={e.industry} onCommit={(v) => setE('industry', v, 'Industry')} /></Field>
            <Field label="Business units / entities in scope" htmlFor="eng-ent" help="Comma separated"><ListIn id="eng-ent" value={e.entities} onCommit={(v) => setE('entities', v, 'Entities')} /></Field>
            <Field label="Geographies and countries" htmlFor="eng-geo" help="Comma separated"><ListIn id="eng-geo" value={e.geographies} onCommit={(v) => setE('geographies', v, 'Geographies')} /></Field>
            <Field label="GBS/GCC location(s)" htmlFor="eng-loc"><ListIn id="eng-loc" value={e.gbsLocations} onCommit={(v) => setE('gbsLocations', v, 'GBS locations')} /></Field>
            <Field label="Primary language" htmlFor="eng-lang"><TextIn id="eng-lang" value={e.primaryLanguage} onCommit={(v) => setE('primaryLanguage', v, 'Primary language')} /></Field>
            <Field label="Additional communication languages" htmlFor="eng-lang2"><ListIn id="eng-lang2" value={e.additionalLanguages} onCommit={(v) => setE('additionalLanguages', v, 'Languages')} /></Field>
            <Field label="Confidentiality designation" htmlFor="eng-conf" help="Printed on generated documents."><TextIn id="eng-conf" value={e.confidentiality} onCommit={(v) => setE('confidentiality', v, 'Confidentiality')} /></Field>
          </div>
          <div style={{ marginTop: 14 }}><Field label="Engagement description" htmlFor="eng-desc" help="Used as the approved GBS purpose statement in artifacts. Leave blank to keep a placeholder."><TextIn id="eng-desc" multiline rows={3} value={e.description} onCommit={(v) => setE('description', v, 'Description')} /></Field></div>
        </Section>
      )}

      {step === 1 && (
        <Section title="Transformation model" hint="Select all characteristics that apply">
          <Chips options={TRANSFORMATION_TYPES.map((t) => ({ value: t, label: t }))} value={e.transformationTypes} onChange={(v) => setE('transformationTypes', v, 'Transformation model')} />
          {e.transformationTypes.includes('Custom engagement type') && <div style={{ marginTop: 12, maxWidth: 420 }}><Field label="Custom engagement type" htmlFor="eng-custom"><TextIn id="eng-custom" value={e.customType} onCommit={(v) => setE('customType', v, 'Custom type')} /></Field></div>}
        </Section>
      )}

      {step === 2 && (
        <Section title="Functions in scope" hint="Transition approach is defined separately for each function">
          <Chips options={FUNCTION_LIBRARY.map((f) => ({ value: f, label: f }))} value={e.functions.map((f) => f.name)}
            onChange={(v) => mutate((d) => {
              d.engagement.functions = v.map((name) => d.engagement.functions.find((f) => f.name === name) ?? { id: uid('fn'), name, approach: 'To be determined' });
            }, { entityType: 'engagement', entityId: e.id, action: 'update', summary: 'Functions in scope updated' })} />
          <div className="row" style={{ marginTop: 10 }}>
            <Btn size="sm" icon={<Plus size={13} />} onClick={() => mutate((d) => { d.engagement.functions.push({ id: uid('fn'), name: 'Custom function', approach: 'To be determined' }); }, { entityType: 'engagement', entityId: e.id, action: 'update', summary: 'Custom function added' })}>Add custom function</Btn>
          </div>
          {e.functions.length > 0 && (
            <div className="tbl-wrap" style={{ marginTop: 14 }}>
              <table className="tbl">
                <thead><tr><th>Function</th><th>Transition approach</th><th /></tr></thead>
                <tbody>{e.functions.map((f) => (
                  <tr key={f.id}>
                    <td><TextIn value={f.name} onCommit={(v) => mutate((d) => { d.engagement.functions.find((x) => x.id === f.id)!.name = v; }, { entityType: 'engagement', entityId: e.id, action: 'update', summary: 'Function renamed' })} /></td>
                    <td><Select value={f.approach} options={TRANSITION_APPROACHES.map((a) => ({ value: a, label: a }))} onChange={(v) => mutate((d) => { d.engagement.functions.find((x) => x.id === f.id)!.approach = v; }, { entityType: 'engagement', entityId: e.id, action: 'update', summary: `Approach for ${f.name}` })} /></td>
                    <td><Btn size="sm" variant="ghost" icon={<Trash2 size={13} />} aria-label="Remove function" onClick={() => mutate((d) => { d.engagement.functions = d.engagement.functions.filter((x) => x.id !== f.id); }, { entityType: 'engagement', entityId: e.id, action: 'update', summary: 'Function removed' })} /></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
        </Section>
      )}

      {step === 3 && (
        <>
          <Section title="Implementation context">
            <div className="grid g3">
              <Field label="Engagement start date" htmlFor="eng-start"><TextIn id="eng-start" type="date" value={e.startDate ?? ''} onCommit={(v) => setE('startDate', v || null, 'Start date')} /></Field>
              <Field label="Planned go-live date (engagement)" htmlFor="eng-golive" help="Should match a wave go-live date."><TextIn id="eng-golive" type="date" value={e.plannedGoLive ?? ''} onCommit={(v) => setE('plannedGoLive', v || null, 'Planned go-live')} /></Field>
              <Field label="Relative time unit (T±n)" htmlFor="eng-unit" help="Changing this does not rescale existing offsets.">
                <Select id="eng-unit" value={e.timeUnit} options={[{ value: 'days', label: 'Days' }, { value: 'weeks', label: 'Weeks' }, { value: 'months', label: 'Months' }]} onChange={(v) => setE('timeUnit', v, 'Time unit')} />
              </Field>
              <Field label="Current project phase" htmlFor="eng-phase"><Select id="eng-phase" value={e.currentPhaseId ?? ''} options={s.phases.map((p) => ({ value: p.id, label: `${p.num}. ${p.name}` }))} onChange={(v) => setE('currentPhaseId', v, 'Current phase')} /></Field>
              <Field label="Originating / retained organisation" htmlFor="eng-orig"><TextIn id="eng-orig" value={e.originOrg} onCommit={(v) => setE('originOrg', v, 'Originating organisation')} /></Field>
              <Field label="Destination / receiving organisation" htmlFor="eng-dest"><TextIn id="eng-dest" value={e.destinationOrg} onCommit={(v) => setE('destinationOrg', v, 'Destination organisation')} /></Field>
            </div>
          </Section>
          <Section title="Transition waves" hint={`${s.waves.length} wave(s). Wave-specific milestones are timed against their own wave go-live.`}
            actions={<Btn size="sm" icon={<Plus size={13} />} onClick={() => mutate((d) => { d.waves.push({ id: uid('wave'), name: `Wave ${d.waves.length + 1}`, goLiveDate: null, scope: '', functions: [], geographies: [] }); }, { entityType: 'wave', entityId: 'new', action: 'add', summary: 'Transition wave added' })}>Add wave</Btn>}>
            <div className="stack">
              {s.waves.map((w) => (
                <div key={w.id} className="insp-block">
                  <div className="grid g4">
                    <Field label="Wave name"><TextIn value={w.name} onCommit={(v) => setWave(w.id, { name: v }, 'Wave renamed')} /></Field>
                    <Field label="Go-live date (T)"><TextIn type="date" value={w.goLiveDate ?? ''} invalid={!w.goLiveDate} onCommit={(v) => setWave(w.id, { goLiveDate: v || null }, `${w.name} go-live → ${v || 'unset'}`)} /></Field>
                    <Field label="Functions"><Select value="" placeholder={w.functions.length ? w.functions.join(', ') : 'All functions'} options={e.functions.map((f) => ({ value: f.name, label: `${w.functions.includes(f.name) ? '✓ ' : ''}${f.name}` }))} onChange={(v) => setWave(w.id, { functions: w.functions.includes(v) ? w.functions.filter((x) => x !== v) : [...w.functions, v] }, 'Wave functions')} /></Field>
                    <Field label="Geographies"><ListIn value={w.geographies} onCommit={(v) => setWave(w.id, { geographies: v }, 'Wave geographies')} /></Field>
                  </div>
                  <div className="row" style={{ marginTop: 8 }}>
                    <div style={{ flex: 1, minWidth: 220 }}><Field label="Scope"><TextIn value={w.scope} onCommit={(v) => setWave(w.id, { scope: v }, 'Wave scope')} /></Field></div>
                    <label className="check"><input type="radio" name="primary-wave" checked={e.primaryWaveId === w.id} onChange={() => setE('primaryWaveId', w.id, 'Primary wave')} /> Primary wave (anchors engagement-wide milestones)</label>
                    {s.waves.length > 1 && <Btn size="sm" variant="danger" icon={<Trash2 size={13} />} onClick={async () => {
                      const used = s.milestones.filter((m) => m.waveId === w.id).length + s.changes.filter((c) => c.waveIds.includes(w.id)).length;
                      if (await ask('Remove wave', `${w.name} is referenced by ${used} milestone(s) or change record(s). Those references will be cleared (milestones become engagement-wide). This cannot be undone except with Undo.`, 'Remove wave', true)) {
                        mutate((d) => {
                          d.waves = d.waves.filter((x) => x.id !== w.id);
                          d.milestones.forEach((m) => { if (m.waveId === w.id) m.waveId = null; });
                          d.changes.forEach((c) => { c.waveIds = c.waveIds.filter((x) => x !== w.id); });
                          d.stakeholders.forEach((x) => { x.waveIds = x.waveIds.filter((y) => y !== w.id); });
                          if (d.engagement.primaryWaveId === w.id) d.engagement.primaryWaveId = d.waves[0]?.id ?? null;
                        }, { entityType: 'wave', entityId: w.id, action: 'delete', summary: `${w.name} removed` });
                      }
                    }}>Remove</Btn>}
                  </div>
                </div>
              ))}
            </div>
          </Section>
        </>
      )}

      {step === 4 && (
        <Section title="Governance configuration" hint="Named people are used in communicator assignments and document sign-offs. Unnamed roles are flagged, never invented."
          actions={<Btn size="sm" icon={<Plus size={13} />} onClick={() => mutate((d) => { d.engagement.governance.push({ id: uid('gov'), title: 'Custom governance role', personName: '', communicatorRoleId: null }); }, { entityType: 'governance', entityId: 'new', action: 'add', summary: 'Governance role added' })}>Add governance role</Btn>}>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>Governance role</th><th>Named person</th><th>Maps to communicator role</th><th /></tr></thead>
              <tbody>{e.governance.map((g) => (
                <tr key={g.id}>
                  <td><TextIn value={g.title} onCommit={(v) => mutate((d) => { d.engagement.governance.find((x) => x.id === g.id)!.title = v; }, { entityType: 'governance', entityId: g.id, action: 'update', summary: 'Governance role renamed' })} /></td>
                  <td><TextIn value={g.personName} placeholder="Not named" onCommit={(v) => mutate((d) => { d.engagement.governance.find((x) => x.id === g.id)!.personName = v; }, { entityType: 'governance', entityId: g.id, action: 'update', summary: `${g.title} → ${v || 'unnamed'}` })} /></td>
                  <td><Select value={g.communicatorRoleId ?? ''} placeholder="— none —" options={s.communicatorRoles.map((r) => ({ value: r.id, label: r.name }))} onChange={(v) => mutate((d) => { d.engagement.governance.find((x) => x.id === g.id)!.communicatorRoleId = v || null; }, { entityType: 'governance', entityId: g.id, action: 'update', summary: 'Governance mapping changed' })} /></td>
                  <td><Btn size="sm" variant="ghost" icon={<Trash2 size={13} />} aria-label="Remove role" onClick={() => mutate((d) => { d.engagement.governance = d.engagement.governance.filter((x) => x.id !== g.id); }, { entityType: 'governance', entityId: g.id, action: 'delete', summary: 'Governance role removed' })} /></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </Section>
      )}

      {step === 5 && (
        <Section title="Available channels" hint="Disabled channels are never recommended. Manage the full library in Communication Channels.">
          {Array.from(new Set(s.channels.map((c) => c.category))).map((cat) => (
            <div key={cat} style={{ marginBottom: 12 }}>
              <div className="label" style={{ marginBottom: 6 }}>{cat}</div>
              <div className="chips">
                {s.channels.filter((c) => c.category === cat).map((c) => (
                  <button key={c.id} className={`chip ${c.enabled ? 'on' : ''}`} aria-pressed={c.enabled}
                    onClick={() => mutate((d) => { const x = d.channels.find((y) => y.id === c.id)!; x.enabled = !x.enabled; }, { entityType: 'channel', entityId: c.id, action: 'toggle', summary: `${c.name} ${c.enabled ? 'disabled' : 'enabled'}` })}>
                    {c.enabled ? '✓ ' : ''}{c.name}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </Section>
      )}

      <div className="row">
        <Btn disabled={step === 0} onClick={() => setStep(step - 1)}>Back</Btn>
        {step < STEPS.length - 1 ? <Btn variant="primary" onClick={() => setStep(step + 1)}>Next: {STEPS[step + 1]}</Btn>
          : <Btn variant="primary" onClick={() => { setE('setupComplete', true, 'Setup'); toast('Engagement setup confirmed'); setView('change-identification'); }}>Confirm setup and continue</Btn>}
        <span className="small muted">Changes save automatically.</span>
      </div>
      {node}
    </>
  );
}
