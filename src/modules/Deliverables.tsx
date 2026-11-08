import { useRef, useState } from 'react';
import { FileSpreadsheet, FileText, Presentation, FileJson, Upload, Loader2 } from 'lucide-react';
import { useApp } from '../store/store';
import { slug } from '../domain/util';
import { buildPptx, buildXlsx, type PptxDeliverable, type XlsxDeliverable } from '../services/office';
import { allArtifactsDocx, consolidatedReportDocx } from '../services/docx';
import { saveFile } from '../services/download';
import { Badge, Btn, PageHeader, Section } from '../ui/kit';

const XLSX: { k: XlsxDeliverable; label: string; desc: string }[] = [
  { k: 'all', label: 'Complete Change Management workbook', desc: 'All registers, matrices, and the master plan in one workbook.' },
  { k: 'stakeholders', label: 'Stakeholder Register', desc: 'Selected stakeholders with roles, waves, population, readiness.' },
  { k: 'changes', label: 'Change Register', desc: 'Every change record with As-Is/To-Be and metadata.' },
  { k: 'impact', label: 'Stakeholder Impact Assessment', desc: 'Executive ✓/×/? matrix plus severity detail sheet.' },
  { k: 'milestones', label: 'Milestone Plan', desc: 'Selected milestones with dates, relative timing, gating.' },
  { k: 'audience', label: 'Audience Matrix', desc: 'Milestone × stakeholder matrix plus selection rationale.' },
  { k: 'communicator', label: 'Communicator Matrix', desc: 'Primary and supporting communicators.' },
  { k: 'channel', label: 'Channel Matrix', desc: 'Colour-coded primary channels with legend.' },
  { k: 'plan', label: 'Master Communication Plan', desc: 'All communication records with every planning field.' },
];
const PPTX: { k: PptxDeliverable; label: string }[] = [
  { k: 'all', label: 'Full executive pack (summary, roadmap, all matrices)' }, { k: 'summary', label: 'Executive summary' }, { k: 'roadmap', label: 'GBS milestone roadmap' },
  { k: 'impact', label: 'Impact matrix slides' }, { k: 'audience', label: 'Audience matrix slides' }, { k: 'communicator', label: 'Communicator matrix slides' }, { k: 'channel', label: 'Channel matrix slides' },
];

export function Deliverables() {
  const s = useApp((x) => x.current)!;
  const toast = useApp((x) => x.toast);
  const importState = useApp((x) => x.importState);
  const [busy, setBusy] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const base = `${slug(s.engagement.name)}`;
  const stamp = new Date().toISOString().slice(0, 10);
  const run = async (key: string, filename: string, make: () => Promise<Blob | string>) => {
    setBusy(key);
    try { const r = await saveFile(filename, await make()); toast(r.message, r.ok ? 'ok' : 'warn'); }
    catch (e) { toast(`Export failed: ${(e as Error).message}`, 'error'); }
    setBusy(null);
  };
  const icon = (k: string, I: typeof FileText) => (busy === k ? <Loader2 size={14} /> : <I size={14} />);

  return (
    <>
      <PageHeader eyebrow="Outputs" title="Deliverables & Exports"
        sub="Native, editable Office files generated in the browser from the engagement's records. Matrices are split across slides with repeated headers rather than truncated. Filenames include engagement, deliverable, and date." />
      {s.engagement.isDemo && <div className="banner demo"><div className="grow small">Exports from the demonstration engagement are labelled as demonstration data.</div></div>}
      <div className="grid g2" style={{ alignItems: 'start' }}>
        <Section title="Excel workbooks (.xlsx)" hint="Frozen headers, group dividers, filters" flush>
          {XLSX.map((x) => (
            <div key={x.k} className="issue"><FileSpreadsheet size={16} color="var(--ok)" /><div className="grow"><div className="small strong">{x.label}</div><div className="tiny muted">{x.desc}</div></div>
              <Btn size="sm" icon={icon(`x-${x.k}`, FileSpreadsheet)} disabled={!!busy} onClick={() => void run(`x-${x.k}`, `${base}_${slug(x.label)}_${stamp}.xlsx`, () => buildXlsx(s, x.k))}>Download</Btn></div>
          ))}
        </Section>
        <div>
          <Section title="Word documents (.docx)" flush>
            <div className="issue"><FileText size={16} color="var(--info)" /><div className="grow"><div className="small strong">Consolidated Change Management report</div><div className="tiny muted">Stage 1–3 narrative: change register, impact matrix, master plan, open issues (landscape matrices).</div></div>
              <Btn size="sm" icon={icon('d-report', FileText)} disabled={!!busy} onClick={() => void run('d-report', `${base}_change-management-report_${stamp}.docx`, () => consolidatedReportDocx(s))}>Download</Btn></div>
            <div className="issue"><FileText size={16} color="var(--info)" /><div className="grid grow"><div className="small strong">All communication artifacts (current versions)</div><div className="tiny muted">{s.artifacts.length} artifact(s) in one document with metadata and status.</div></div>
              <Btn size="sm" icon={icon('d-all', FileText)} disabled={!!busy || !s.artifacts.length} onClick={() => void run('d-all', `${base}_communication-artifacts_${stamp}.docx`, () => allArtifactsDocx(s))}>Download</Btn></div>
            <div className="issue small muted">Individual artifacts, executive briefing notes, training packs, and KT status reports download from the Artifact Studio.</div>
          </Section>
          <Section title="PowerPoint (.pptx)" hint="Editable tables, paginated" flush>
            {PPTX.map((x) => (
              <div key={x.k} className="issue"><Presentation size={16} color="var(--warn)" /><div className="grow small strong">{x.label}</div>
                <Btn size="sm" icon={icon(`p-${x.k}`, Presentation)} disabled={!!busy} onClick={() => void run(`p-${x.k}`, `${base}_${slug(x.label)}_${stamp}.pptx`, () => buildPptx(s, x.k))}>Download</Btn></div>
            ))}
          </Section>
          <Section title="Engagement data" flush>
            <div className="issue"><FileJson size={16} /><div className="grow"><div className="small strong">Export engagement (.json)</div><div className="tiny muted">Full engagement backup, including decisions, artifacts, versions, and audit log.</div></div>
              <Btn size="sm" disabled={!!busy} onClick={() => void run('json', `${base}_engagement-backup_${stamp}.json`, async () => JSON.stringify(s, null, 2))}>Download</Btn></div>
            <div className="issue"><Upload size={16} /><div className="grow"><div className="small strong">Import engagement (.json)</div><div className="tiny muted">Validated before import; added as a separate engagement.</div></div>
              <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={async (e) => {
                const f = e.target.files?.[0]; e.target.value = '';
                if (!f) return;
                try { const r = await importState(JSON.parse(await f.text())); toast(r.message, r.ok ? 'ok' : 'error'); } catch { toast('The file is not valid JSON.', 'error'); }
              }} />
              <Btn size="sm" onClick={() => fileRef.current?.click()}>Choose file</Btn></div>
          </Section>
          <Section title="Not yet implemented">
            <div className="row small"><Badge tone="muted">PDF</Badge><span>Native PDF export is not implemented. Download the DOCX or PPTX and save as PDF from Office.</span></div>
          </Section>
        </div>
      </div>
    </>
  );
}
