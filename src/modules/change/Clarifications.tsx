import { useMemo, useState } from 'react';
import { useApp } from '../../store/store';
import { derive } from '../../engine/derive';
import { QUESTIONS } from '../../catalogue/questions';
import { getTemplate } from '../../catalogue/registry';
import { clearClarification, setClarification } from '../../store/changeActions';
import { Badge, Btn, Empty, Section } from '../../ui/kit';

/** One card per question; one answer can be applied to every selected change that asks it. */
export function Clarifications() {
  const s = useApp((x) => x.current)!;
  const toast = useApp((x) => x.toast);
  const inspect = useApp((x) => x.inspect);
  const d = useMemo(() => derive(s), [s]);
  const [showAnswered, setShowAnswered] = useState(false);
  const answered = new Map<string, { opt: string; ids: string[] }[]>();
  for (const c of d.activeChangeRecords) for (const [q, a] of Object.entries(c.clarificationAnswers ?? {})) {
    if (!a || a === 'skip') continue;
    const list = answered.get(q) ?? [];
    const g = list.find((x) => x.opt === a);
    if (g) g.ids.push(c.id); else list.push({ opt: a, ids: [c.id] });
    answered.set(q, list);
  }
  return (
    <>
      <p className="small muted" style={{ marginBottom: 12 }}>Only questions whose answer changes who is impacted are asked. Answer once and apply to all affected changes, or skip — skipped impact-relevant questions leave the dependent stakeholder relationships as “Requires review”.</p>
      {!d.clarificationQueue.length && <Empty title="No outstanding clarifications">All questions for the selected changes are answered.</Empty>}
      {d.clarificationQueue.map((g) => <QuestionCard key={g.questionId} questionId={g.questionId} changeIds={g.changeIds} onApply={(opt, ids) => { setClarification(ids, g.questionId, opt); toast(`Answer applied to ${ids.length} change(s); impacts re-evaluated`); }} onOpen={(id) => inspect({ kind: 'change', changeId: id })} />)}
      <div className="row" style={{ margin: '8px 0' }}><Btn size="sm" onClick={() => setShowAnswered(!showAnswered)}>{showAnswered ? 'Hide' : 'Show'} answered questions ({[...answered.values()].reduce((n, l) => n + l.reduce((m, x) => m + x.ids.length, 0), 0)})</Btn></div>
      {showAnswered && [...answered.entries()].map(([qid, groups]) => {
        const qq = QUESTIONS[qid];
        return (
          <Section key={qid} title={qq?.text ?? qid}>
            {groups.map((gr) => (
              <div key={gr.opt} className="row small" style={{ marginBottom: 6 }}>
                <Badge tone="ok">{qq?.options.find((o) => o.id === gr.opt)?.label ?? gr.opt}</Badge>
                <span>{gr.ids.map((id) => s.changes.find((c) => c.id === id)?.code).join(', ')}</span>
                <span style={{ flex: 1 }} />
                <Btn size="sm" variant="ghost" onClick={() => clearClarification(gr.ids, qid)}>Clear answer</Btn>
              </div>
            ))}
          </Section>
        );
      })}
    </>
  );
}

function QuestionCard({ questionId, changeIds, onApply, onOpen }: { questionId: string; changeIds: string[]; onApply: (opt: string, ids: string[]) => void; onOpen: (id: string) => void }) {
  const s = useApp((x) => x.current)!;
  const qq = QUESTIONS[questionId];
  const [opt, setOpt] = useState('');
  const [ids, setIds] = useState<Set<string>>(new Set(changeIds));
  if (!qq) return null;
  const skipped = changeIds.filter((id) => s.changes.find((c) => c.id === id)?.clarificationAnswers?.[questionId] === 'skip');
  return (
    <div className="q-card">
      <div className="q-head">
        <div className="row"><strong>{qq.text}</strong>{qq.impactCritical ? <Badge tone="warn">affects impact classification</Badge> : <Badge tone="muted">refines scope</Badge>}<span style={{ flex: 1 }} /><span className="small muted">{changeIds.length} change(s){skipped.length ? ` · ${skipped.length} skipped` : ''}</span></div>
        <div className="small muted">{qq.help}</div>
      </div>
      <div className="grid g2" style={{ padding: 14 }}>
        <div>
          {qq.options.map((o) => (
            <label key={o.id} className="q-opt"><input type="radio" name={`q-${questionId}`} checked={opt === o.id} onChange={() => setOpt(o.id)} /><span><span className="strong small">{o.label}</span><div className="tiny muted">{o.effect}</div></span></label>
          ))}
        </div>
        <div>
          <div className="label" style={{ marginBottom: 4 }}>Apply to</div>
          <div style={{ maxHeight: 180, overflow: 'auto' }}>
            {changeIds.map((id) => {
              const c = s.changes.find((x) => x.id === id)!;
              const t = getTemplate(c.templateId, c.templateVersion, s);
              return (
                <div key={id} className="row small" style={{ marginBottom: 3 }}>
                  <input type="checkbox" checked={ids.has(id)} onChange={() => { const n = new Set(ids); if (n.has(id)) n.delete(id); else n.add(id); setIds(n); }} aria-label={`Apply to ${c.code}`} />
                  <button className="btn ghost sm" style={{ padding: 0 }} onClick={() => onOpen(id)}><span className="mono">{c.code}</span>&nbsp;{t?.title ?? c.title}</button>
                </div>
              );
            })}
          </div>
          <div className="row" style={{ marginTop: 8 }}>
            <Btn variant="primary" size="sm" disabled={!opt || !ids.size} onClick={() => onApply(opt, [...ids])}>Apply to {ids.size} change(s)</Btn>
            <Btn size="sm" disabled={!ids.size} onClick={() => onApply('skip', [...ids])}>Skip (requires review)</Btn>
          </div>
        </div>
      </div>
    </div>
  );
}
