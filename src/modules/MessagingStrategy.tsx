import { useMemo, useState } from 'react';
import { useApp } from '../store/store';
import { derive } from '../engine/derive';
import { OBJECTIVES, TONES } from '../domain/library';
import { milestoneLabel } from '../engine/matrixText';
import { countPlaceholders, includesCI } from '../domain/util';
import { BriefEditor } from '../ui/inspectors';
import { Badge, Empty, PageHeader, Section, Seg, PhText, Btn } from '../ui/kit';

export function MessagingStrategy() {
  const s = useApp((x) => x.current)!;
  const setView = useApp((x) => x.setView);
  const d = useMemo(() => derive(s), [s]);
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<string | null>(null);
  const [mode, setMode] = useState<'brief' | 'compare'>('brief');
  const list = d.activeComms.filter((c) => !q || includesCI(`${c.audience.roleName} ${c.milestone.name} ${c.rec.code}`, q));
  const current = (sel && d.commById.get(sel)) || list[0];
  const peers = current ? d.activeComms.filter((c) => c.milestone.id === current.milestone.id) : [];

  return (
    <>
      <PageHeader eyebrow="Stage 3 · Change Management Plan" title="Communication Messaging Strategy"
        sub="The “what” of each communication: an audience-specific messaging brief built from the linked change records, impact assessment, timing, and communicators. The same milestone produces different messages for different audiences."
        actions={<Seg options={[{ value: 'brief', label: 'Messaging brief' }, { value: 'compare', label: 'Compare audiences at milestone' }]} value={mode} onChange={setMode} />} />
      {!d.activeComms.length ? <Empty title="No communication records yet" actions={<Btn variant="primary" onClick={() => setView('audience-matrix')}>Open Audience Matrix</Btn>} /> : (
        <div className="grid" style={{ gridTemplateColumns: 'minmax(240px, 320px) minmax(0, 1fr)', alignItems: 'start' }}>
          <Section title="Communications" hint={`${list.length}`} flush>
            <div style={{ padding: 10 }}><input className="input" placeholder="Search audience or milestone…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search communications" /></div>
            <div style={{ maxHeight: 'calc(100vh - 300px)', overflow: 'auto' }}>
              {list.map((c) => {
                const n = countPlaceholders(JSON.stringify(c.brief));
                return (
                  <button key={c.rec.id} onClick={() => setSel(c.rec.id)} className="issue" style={{ width: '100%', border: 0, borderBottom: '1px solid var(--divider)', background: current?.rec.id === c.rec.id ? 'var(--pale)' : 'transparent', textAlign: 'left', cursor: 'pointer' }}>
                    <div className="grow"><div className="small strong">{c.audience.roleName}</div><div className="tiny muted">{c.rec.code} · {milestoneLabel(s, c.milestone)}</div></div>
                    <div className="stack" style={{ gap: 2, alignItems: 'flex-end' }}><Badge tone="muted">{OBJECTIVES[c.rec.objective]}</Badge>{n > 0 && <Badge tone="warn">{n} to confirm</Badge>}</div>
                  </button>
                );
              })}
            </div>
          </Section>
          {current && (mode === 'brief' ? (
            <Section title={`${current.audience.roleName} — ${current.milestone.name}`} hint={`${current.rec.code} · ${OBJECTIVES[current.rec.objective]} · ${s.commTypes.find((t) => t.id === current.rec.commTypeId)?.name} · tone: ${TONES[current.brief.tone]}`}>
              <BriefEditor key={current.rec.id} id={current.rec.id} />
            </Section>
          ) : (
            <Section title={`Audience-specific messaging at “${current.milestone.name}”`} hint={`${peers.length} audiences`} flush>
              <div className="tbl-wrap"><table className="tbl">
                <thead><tr><th>Audience</th><th>Objective / tone</th><th>Main message</th><th>Required actions</th></tr></thead>
                <tbody>{peers.map((c) => (
                  <tr key={c.rec.id} className="clickable" onClick={() => { setSel(c.rec.id); setMode('brief'); }}>
                    <td className="small strong" style={{ minWidth: 160 }}>{c.audience.roleName}</td>
                    <td className="small">{OBJECTIVES[c.rec.objective]}<div className="muted">{TONES[c.brief.tone]}</div></td>
                    <td className="small" style={{ minWidth: 300 }}><PhText text={c.brief.mainMessage} /></td>
                    <td className="small" style={{ minWidth: 220 }}><ul className="clean">{c.brief.requiredActions.map((a, i) => <li key={i}><PhText text={a} /></li>)}</ul></td>
                  </tr>
                ))}</tbody>
              </table></div>
            </Section>
          ))}
        </div>
      )}
    </>
  );
}
