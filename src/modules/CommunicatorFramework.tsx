import { useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import { useApp } from '../store/store';
import { uid } from '../domain/util';
import { derive } from '../engine/derive';
import { Badge, Btn, Modal, PageHeader, Section, TextIn, Prov } from '../ui/kit';
import { rolePerson } from '../engine/communicator';

const RULES: { id: string; when: string; result: string }[] = [
  { id: 'C-SENS', when: 'Communication type is Critical / Sensitive (e.g. employee transfer, role change)', result: 'CHRO / HR Leadership delivers; HRBP / line manager and Function Head support; HR Lead owns; approval by CHRO and Legal. Always requires review; HR review must be recorded before approval.' },
  { id: 'C-CRISIS', when: 'Crisis / incident communication', result: 'Corporate Communications as approved spokesperson with the GBS Head; CEO and Legal approve. Always requires review.' },
  { id: 'C-STRAT', when: 'Strategic alignment', result: 'Board → CEO / Executive Sponsor. CEO/sponsor → GBS Head. Executives → CEO. GBS leaders → GBS Head. Function leaders → accountable functional CXO (CFO for Finance, CHRO for HR).' },
  { id: 'C-TRAIN', when: 'Training', result: 'Training Lead delivers and owns; Function Head sponsors (IT Lead supports when a technology change is linked); Programme Head approves.' },
  { id: 'C-PROG / C-PROG-CAD', when: 'Programme orchestration (one-off or recurring)', result: 'Programme Head; recurring status → PMO Lead (steering audiences: Programme Head presents, PMO prepares).' },
  { id: 'C-EXT-SUP / CUS / OTH', when: 'External audience', result: 'Suppliers → Procurement Lead with functional CXO, Legal + Procurement approve. Customers → functional CXO with Corporate Communications. Regulators/partners → no spokesperson assigned: requires review.' },
  { id: 'C-AWARE', when: 'Stakeholder awareness', result: 'Enterprise / mass audiences → GBS Head, content via Corporate Communications (CEO supports go-live). Function-specific → Function Head / Process Owner with GBS Head.' },
  { id: 'C-OPS', when: 'Operational / transactional updates', result: 'Role accountable for the service, system, or process (IT Lead, HR Lead, GBS Head, Function Head…).' },
  { id: 'Guardrails', when: 'Always', result: 'An audience is never its own communicator. If no rule applies, the result is “Communicator assignment requires review”. Roles without a named person in governance are flagged as gaps, never filled with invented names.' },
];

export function CommunicatorFramework() {
  const s = useApp((x) => x.current)!;
  const mutate = useApp((x) => x.mutate);
  const d = useMemo(() => derive(s), [s]);
  const [edit, setEdit] = useState<{ role: string; type: string } | null>(null);
  const [text, setText] = useState('');
  const usage = (roleId: string, typeId: string) => d.activeComms.filter((c) => c.roles.primary === roleId && c.rec.commTypeId === typeId).length;

  return (
    <>
      <PageHeader eyebrow="Stage 3 · Change Management Plan" title="Communicator Responsibility Framework"
        sub="Which roles are appropriate for each type of communication. These are default decision rules, not universal mandates; milestone-specific assignments are made in the Communicator Matrix."
        actions={<Btn icon={<Plus size={13} />} onClick={() => mutate((dd) => { const id = uid('cr'); dd.communicatorRoles.push({ id, name: 'Custom communicator role', short: 'Custom', description: '', isCustom: true }); dd.framework[id] = {}; }, { entityType: 'communicator', entityId: 'new', action: 'add', summary: 'Custom communicator role added' })}>Add communicator role</Btn>} />
      <Section title="Responsibility matrix" hint="Click a cell to edit guidance · numbers show current primary assignments in the plan" flush>
        <div className="mx-scroll" style={{ maxHeight: 'none' }}>
          <table className="mx">
            <thead><tr><th className="frozen" style={{ left: 0, minWidth: 240 }}>Communicator role</th>{s.commTypes.map((t) => <th key={t.id} style={{ minWidth: 170 }}><span className="colhead">{t.name}</span><div className="tiny" style={{ fontWeight: 400, opacity: 0.8 }}>sensitivity: {t.sensitivity}</div></th>)}</tr></thead>
            <tbody>{s.communicatorRoles.map((r) => (
              <tr key={r.id}>
                <td className="frozen rowhead" style={{ left: 0 }}>
                  <TextIn value={r.name} onCommit={(v) => mutate((dd) => { dd.communicatorRoles.find((x) => x.id === r.id)!.name = v; }, { entityType: 'communicator', entityId: r.id, action: 'rename', summary: 'Communicator role renamed' })} />
                  <div className="tiny muted" style={{ marginTop: 3 }}>{rolePerson(s, r.id) ? `Named: ${rolePerson(s, r.id)}` : 'No named person in governance'}{r.isCustom && ' · custom'}</div>
                </td>
                {s.commTypes.map((t) => {
                  const g = s.framework[r.id]?.[t.id] ?? '';
                  const n = usage(r.id, t.id);
                  return (
                    <td key={t.id} className="cellc" style={{ textAlign: 'left', verticalAlign: 'top' }} onClick={() => { setEdit({ role: r.id, type: t.id }); setText(g); }} tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter') { setEdit({ role: r.id, type: t.id }); setText(g); } }}>
                      <div style={{ padding: '6px 8px', fontSize: 11, lineHeight: 1.35, color: g ? 'var(--text)' : 'var(--text-2)' }}>{g || '—'}{n > 0 && <div style={{ marginTop: 4 }}><Badge tone="info">{n} in plan</Badge></div>}</div>
                    </td>
                  );
                })}
              </tr>
            ))}</tbody>
          </table>
        </div>
      </Section>
      <Section title="Conditional assignment logic" hint={<><Prov kind="rule" /> Implemented in the communicator engine</>} flush>
        <div className="tbl-wrap"><table className="tbl">
          <thead><tr><th>Rule</th><th>Condition</th><th>Default assignment</th></tr></thead>
          <tbody>{RULES.map((r) => <tr key={r.id}><td className="mono">{r.id}</td><td className="small" style={{ minWidth: 220 }}>{r.when}</td><td className="small">{r.result}</td></tr>)}</tbody>
        </table></div>
        <p className="small muted" style={{ padding: '10px 14px' }}>Factors considered: communication type, sensitivity, decision authority, audience seniority and archetype, functional accountability (from linked change records), employment implications, governance configuration, and approval requirements.</p>
      </Section>
      {edit && (
        <Modal title={`${s.communicatorRoles.find((r) => r.id === edit.role)?.name} — ${s.commTypes.find((t) => t.id === edit.type)?.name}`} onClose={() => setEdit(null)}
          footer={<><Btn onClick={() => setEdit(null)}>Cancel</Btn><Btn variant="primary" onClick={() => { mutate((dd) => { dd.framework[edit.role] = { ...(dd.framework[edit.role] ?? {}), [edit.type]: text }; }, { entityType: 'framework', entityId: `${edit.role}|${edit.type}`, action: 'update', summary: 'Framework guidance edited' }); setEdit(null); }}>Save guidance</Btn></>}>
          <textarea className="textarea" rows={5} value={text} onChange={(e) => setText(e.target.value)} placeholder="Responsibilities, typical messages, or applicability" aria-label="Guidance" />
        </Modal>
      )}
    </>
  );
}
