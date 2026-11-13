import { useRef, useState } from 'react';
import { Upload } from 'lucide-react';
import { useApp } from '../../store/store';
import { listLatestTemplates, getLatestTemplate } from '../../catalogue/registry';
import { matchTemplates } from '../../catalogue/instance';
import { parseChangeFile } from '../../services/importParse';
import { queueImport, resolveImport } from '../../store/changeActions';
import { Badge, Btn, Empty, Section, Select } from '../../ui/kit';

export function ImportChanges() {
  const s = useApp((x) => x.current)!;
  const toast = useApp((x) => x.toast);
  const inspect = useApp((x) => x.inspect);
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState<'pending' | 'all'>('pending');
  const [choice, setChoice] = useState<Record<string, string>>({});
  const rows = s.importQueue.filter((r) => filter === 'all' || r.status === 'pending');
  const all = listLatestTemplates().filter((t) => t.active);

  return (
    <>
      <Section title="Import an existing change list" hint="CSV or Excel (.xlsx). Columns detected by header: Title / Change, Description, Function, Dimension.">
        <div className="row">
          <input ref={ref} type="file" accept=".csv,.txt,.xlsx" hidden onChange={async (e) => {
            const file = e.target.files?.[0]; e.target.value = '';
            if (!file) return;
            setBusy(true);
            try {
              const parsed = await parseChangeFile(file);
              if (!parsed.length) toast('No change rows found in the file.', 'warn');
              else toast(`${queueImport(parsed)} row(s) queued for review — nothing is added until you confirm.`);
            } catch (err) { toast(`Could not read the file: ${(err as Error).message}`, 'error'); }
            setBusy(false);
          }} />
          <Btn variant="primary" icon={<Upload size={14} />} disabled={busy} onClick={() => ref.current?.click()}>{busy ? 'Reading…' : 'Choose file'}</Btn>
          <span className="small muted">Each row is matched to the closest library template. You confirm every match; unmatched rows can become custom changes. Rows are never silently discarded.</span>
        </div>
      </Section>
      <Section flush title="Import review" hint={`${s.importQueue.filter((r) => r.status === 'pending').length} pending · ${s.importQueue.length} total`}
        actions={<Select value={filter} options={[{ value: 'pending', label: 'Pending rows' }, { value: 'all', label: 'All rows (incl. resolved)' }]} onChange={(v) => setFilter(v as 'pending')} />}>
        {!rows.length ? <Empty title={s.importQueue.length ? 'All imported rows are resolved' : 'No imported rows'} /> : (
          <div className="mx-scroll"><table className="tbl">
            <thead><tr><th>Imported change</th><th>Function / dimension</th><th>Proposed library match</th><th>Match</th><th>Status</th><th>Action</th></tr></thead>
            <tbody>{rows.map((r) => {
              const options = matchTemplates(`${r.rawTitle} ${r.rawDescription}`, r.rawFunction);
              const sel = choice[r.id] ?? r.matchTemplateId ?? '';
              const t = sel ? getLatestTemplate(sel) : undefined;
              const dup = t ? s.changes.find((c) => c.templateId === t.templateId && c.active) : undefined;
              return (
                <tr key={r.id}>
                  <td style={{ minWidth: 220 }}><div className="strong small">{r.rawTitle}</div><div className="tiny muted">{r.rawDescription}</div></td>
                  <td className="small">{r.rawFunction || '—'}<div className="tiny muted">{r.rawDimension}</div></td>
                  <td style={{ minWidth: 280 }}>
                    {r.status === 'pending' ? (
                      <select className="select" value={sel} onChange={(e) => setChoice({ ...choice, [r.id]: e.target.value })} aria-label="Library match">
                        <option value="">— No match: create as custom —</option>
                        <optgroup label="Closest matches">{options.map((o) => <option key={o.template.templateId} value={o.template.templateId}>{o.template.title} ({Math.round(o.score * 100)}%)</option>)}</optgroup>
                        <optgroup label="All templates">{all.filter((x) => !options.some((o) => o.template.templateId === x.templateId)).map((x) => <option key={x.templateId} value={x.templateId}>{x.title}</option>)}</optgroup>
                      </select>
                    ) : <span className="small">{r.matchTemplateId ? getLatestTemplate(r.matchTemplateId)?.title : '—'}</span>}
                    {dup && r.status === 'pending' && <div className="tiny" style={{ color: 'var(--warn)' }}>Already selected as {dup.code} — accepting links to it (no duplicate).</div>}
                  </td>
                  <td>{r.matchTemplateId ? <Badge tone={r.matchScore >= 0.4 ? 'ok' : r.matchScore >= 0.25 ? 'info' : 'warn'}>{Math.round(r.matchScore * 100)}%</Badge> : <Badge tone="muted">none</Badge>}</td>
                  <td><Badge tone={r.status === 'pending' ? 'warn' : r.status === 'dismissed' ? 'muted' : 'ok'}>{r.status}</Badge>{r.resultChangeId && <div><button className="btn ghost sm" style={{ padding: 0 }} onClick={() => inspect({ kind: 'change', changeId: r.resultChangeId! })}>{s.changes.find((c) => c.id === r.resultChangeId)?.code}</button></div>}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>{r.status === 'pending' && <>
                    <Btn size="sm" variant="primary" disabled={!sel} onClick={() => { resolveImport(r.id, 'accept', sel); toast('Matched to library template'); }}>Confirm match</Btn>
                    <Btn size="sm" onClick={() => resolveImport(r.id, 'custom')}>Create custom</Btn>
                    <Btn size="sm" variant="ghost" onClick={() => resolveImport(r.id, 'dismiss')}>Dismiss</Btn>
                  </>}</td>
                </tr>
              );
            })}</tbody>
          </table></div>
        )}
      </Section>
    </>
  );
}
