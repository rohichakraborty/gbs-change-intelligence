// DOCX generation with the `docx` library — real, editable Word documents.
import {
  AlignmentType, BorderStyle, Document, Footer, Header, HeadingLevel, Packer, PageNumber, PageOrientation, Paragraph,
  ShadingType, Table, TableCell, TableRow, TextRun, WidthType,
} from 'docx';
import type { Artifact, ArtifactVersion, EngagementState } from '../domain/types';
import { ARTIFACT_TYPES, COMM_STATUS_LABEL, OBJECTIVES } from '../domain/library';
import { fmtDate, fmtDateTime, PLACEHOLDER_RE } from '../domain/util';
import { derive } from '../engine/derive';
import { roleName } from '../engine/communicator';
import { groupMilestones, groupStakeholders, impactCellText, milestoneLabel, timingLabel } from '../engine/matrixText';

const NAVY = '14263D';
const BLUE = '245A81';
const GREY = '617186';
const FONT = 'Calibri';

function runs(text: string, opts: { bold?: boolean; color?: string; size?: number } = {}): TextRun[] {
  const out: TextRun[] = [];
  let last = 0;
  const re = new RegExp(PLACEHOLDER_RE.source, 'g');
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(new TextRun({ text: text.slice(last, m.index), font: FONT, ...opts }));
    out.push(new TextRun({ text: m[0], font: FONT, bold: true, highlight: 'yellow', size: opts.size }));
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(new TextRun({ text: text.slice(last), font: FONT, ...opts }));
  if (!out.length) out.push(new TextRun({ text: '', font: FONT }));
  return out;
}

const cell = (text: string, header = false, width?: number, fill?: string) => new TableCell({
  children: [new Paragraph({ children: runs(text, { bold: header, color: header ? 'FFFFFF' : undefined, size: 18 }) })],
  shading: header ? { type: ShadingType.CLEAR, color: 'auto', fill: NAVY } : fill ? { type: ShadingType.CLEAR, color: 'auto', fill } : undefined,
  width: width ? { size: width, type: WidthType.PERCENTAGE } : undefined,
  margins: { top: 50, bottom: 50, left: 80, right: 80 },
});

function table(rows: string[][], header = true): Table {
  const border = { style: BorderStyle.SINGLE, size: 4, color: 'DCE3EA' };
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: { top: border, bottom: border, left: border, right: border, insideHorizontal: border, insideVertical: border },
    rows: rows.map((r, i) => new TableRow({ tableHeader: header && i === 0, children: r.map((c) => cell(c, header && i === 0)) })),
  });
}

/** Markdown-lite body → docx blocks. */
export function bodyToBlocks(body: string): (Paragraph | Table)[] {
  const out: (Paragraph | Table)[] = [];
  const lines = body.split('\n');
  let tableRows: string[][] = [];
  const flushTable = () => {
    if (tableRows.length) { out.push(table(tableRows)); out.push(new Paragraph({ text: '' })); tableRows = []; }
  };
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (/^\|.*\|$/.test(line.trim())) {
      tableRows.push(line.trim().slice(1, -1).split('|').map((c) => c.trim()));
      continue;
    }
    flushTable();
    if (!line.trim()) continue;
    if (line.startsWith('### ')) out.push(new Paragraph({ heading: HeadingLevel.HEADING_3, children: runs(line.slice(4), { color: BLUE, bold: true }) }));
    else if (line.startsWith('- ')) out.push(new Paragraph({ bullet: { level: 0 }, children: runs(line.slice(2)), spacing: { after: 60 } }));
    else if (/^\*\*.*\*\*$/.test(line)) out.push(new Paragraph({ children: runs(line.slice(2, -2), { bold: true }), spacing: { before: 120, after: 40 } }));
    else out.push(new Paragraph({ children: runs(line), spacing: { after: 120 } }));
  }
  flushTable();
  return out;
}

function headerFooter(s: EngagementState, status: string) {
  return {
    headers: { default: new Header({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: `${s.engagement.name}  ·  ${s.engagement.confidentiality}`, font: FONT, size: 16, color: GREY })] })] }) },
    footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [
      new TextRun({ text: `${status}  ·  Generated with GBS Change Intelligence  ·  Page `, font: FONT, size: 16, color: GREY }),
      new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: 16, color: GREY }),
    ] })] }) },
  };
}

const docStyles = {
  default: { document: { run: { font: FONT, size: 21, color: '172536' } } },
  paragraphStyles: [
    { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { size: 32, bold: true, color: NAVY, font: FONT }, paragraph: { spacing: { before: 240, after: 120 } } },
    { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { size: 25, bold: true, color: NAVY, font: FONT }, paragraph: { spacing: { before: 240, after: 80 } } },
    { id: 'Heading3', name: 'Heading 3', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { size: 22, bold: true, color: BLUE, font: FONT }, paragraph: { spacing: { before: 160, after: 60 } } },
  ],
};

function artifactBlocks(s: EngagementState, a: Artifact, v: ArtifactVersion): (Paragraph | Table)[] {
  const d = derive(s);
  const cv = d.commById.get(a.communicationRecordId);
  const status = a.approvalStatus === 'approved' ? 'Approved' : a.approvalStatus === 'pending' ? 'Pending approval' : 'Draft — not approved for distribution';
  const isEmail = ['general_announcement', 'impacted_email', 'golive_announcement', 'training_comm', 'hypercare', 'vendor', 'customer', 'leadership_announcement'].includes(a.type);
  const meta: string[][] = [
    ['Document', ARTIFACT_TYPES[a.type].label],
    ['Engagement', s.engagement.name + (s.engagement.isDemo ? ' (demonstration data)' : '')],
    ['Communication record', cv ? `${cv.rec.code} — ${OBJECTIVES[cv.rec.objective]}, ${s.commTypes.find((c) => c.id === cv.rec.commTypeId)?.name ?? ''}` : a.communicationRecordId],
    ['Milestone', cv ? `${milestoneLabel(s, cv.milestone)} (${timingLabel(s, cv.milestone)})` : '—'],
    ['Planned date', cv?.plannedDate ? fmtDate(cv.plannedDate) : '[CONFIRM PLANNED DATE]'],
    ['Content approver(s)', cv?.roles.approvers.map((id) => roleName(s, id)).join(', ') || '[CONFIRM CONTENT APPROVER]'],
    ['Version', `v${v.v} · ${v.origin} · ${fmtDateTime(v.createdAt)}`],
    ['Status', status],
    ['Confidentiality', s.engagement.confidentiality],
  ];
  const out: (Paragraph | Table)[] = [
    new Paragraph({ heading: HeadingLevel.HEADING_1, children: runs(a.title) }),
    table(meta.map(([k, val]) => [k, val]), false),
    new Paragraph({ text: '' }),
  ];
  if (isEmail) {
    out.push(new Paragraph({ heading: HeadingLevel.HEADING_2, children: runs('Email') }));
    out.push(table([['To / Audience', v.meta.to], ['From / Communicator', v.meta.from], ['Subject', v.meta.subject]], false));
    out.push(new Paragraph({ text: '' }));
  }
  for (const sec of v.sections.filter((x) => !x.removed)) {
    out.push(new Paragraph({ heading: HeadingLevel.HEADING_2, children: runs(sec.heading) }));
    out.push(...bodyToBlocks(sec.body));
  }
  return out;
}

export async function artifactDocx(s: EngagementState, a: Artifact, v: ArtifactVersion): Promise<Blob> {
  const status = a.approvalStatus === 'approved' ? 'APPROVED' : 'DRAFT — NOT APPROVED FOR DISTRIBUTION';
  const doc = new Document({
    creator: 'GBS Change Intelligence', title: a.title, description: `${ARTIFACT_TYPES[a.type].label} v${v.v}`, styles: docStyles,
    sections: [{ properties: {}, ...headerFooter(s, status), children: artifactBlocks(s, a, v) }],
  });
  return Packer.toBlob(doc);
}

export async function allArtifactsDocx(s: EngagementState): Promise<Blob> {
  const sections = s.artifacts.map((a, i) => ({
    properties: {}, ...headerFooter(s, a.approvalStatus === 'approved' ? 'APPROVED' : 'DRAFT'),
    children: [...(i === 0 ? [new Paragraph({ heading: HeadingLevel.HEADING_1, children: runs(`${s.engagement.name} — Communication Artifacts`) }), new Paragraph({ children: runs(`${s.artifacts.length} artifact(s), current versions. Generated ${fmtDateTime(new Date().toISOString())}.`) })] : []),
      ...artifactBlocks(s, a, a.versions[a.versions.length - 1])],
  }));
  const doc = new Document({ creator: 'GBS Change Intelligence', title: `${s.engagement.name} — artifacts`, styles: docStyles, sections: sections.length ? sections : [{ children: [new Paragraph('No artifacts generated yet.')] }] });
  return Packer.toBlob(doc);
}

/** Consolidated Change Management report (landscape for matrices). */
export async function consolidatedReportDocx(s: EngagementState): Promise<Blob> {
  const d = derive(s);
  const e = s.engagement;
  const intro: (Paragraph | Table)[] = [
    new Paragraph({ heading: HeadingLevel.HEADING_1, children: runs(`${e.name}`) }),
    new Paragraph({ children: runs('Change Management Report — Change Identification, Stakeholder Impact Assessment, and Change Management Plan', { color: GREY }) }),
    new Paragraph({ text: '' }),
    table([
      ['Organisation', e.client || '—'], ['Industry', e.industry || '—'], ['Engagement type', e.transformationTypes.join(', ') || '—'],
      ['Functions', e.functions.map((f) => `${f.name} (${f.approach})`).join('; ') || '—'], ['Geographies', e.geographies.join(', ') || '—'],
      ['GBS location(s)', e.gbsLocations.join(', ') || '—'], ['Waves', s.waves.map((w) => `${w.name}: ${fmtDate(w.goLiveDate, '[CONFIRM GO-LIVE DATE]')}`).join('; ')],
      ['Status', e.isDemo ? 'Demonstration data — not validated' : 'Working draft for consultant review'],
    ], false),
    new Paragraph({ heading: HeadingLevel.HEADING_2, children: runs('Stage 1 — Change Identification') }),
    table([['ID', 'Dimension', 'Change', 'As-Is', 'To-Be', 'Function', 'Status'], ...s.changes.map((c) => [c.code, s.dimensions.find((x) => x.id === c.dimensionId)?.short ?? '', c.title, c.asIs || '[CONFIRM AS-IS]', c.toBe || '[CONFIRM TO-BE]', c.functionName || '—', c.status.replace('_', ' ')])]),
  ];
  const impactRows: string[][] = [['Stakeholder', ...d.selectedDims.map((x) => x.short)]];
  for (const g of groupStakeholders(s, d.selectedStakeholders)) {
    impactRows.push([`${g.group.code}. ${g.group.name}`, ...d.selectedDims.map(() => '')]);
    for (const st of g.members) impactRows.push([st.roleName, ...d.selectedDims.map((dim) => impactCellText(d, st.id, dim.id))]);
  }
  const stage2: (Paragraph | Table)[] = [
    new Paragraph({ heading: HeadingLevel.HEADING_2, children: runs('Stage 2 — Stakeholder Impact Assessment') }),
    new Paragraph({ children: runs('Assessment of how stakeholder groups are impacted across key change dimensions. ✓ Impacted · × Not impacted · ? Requires review.', { color: GREY }) }),
    table(impactRows),
  ];
  const planRows: string[][] = [['ID', 'Phase', 'Milestone', 'Timing', 'Audience', 'Objective', 'Communicator', 'Channel(s)', 'Planned', 'Status']];
  for (const pr of groupMilestones(s, d.activeMilestones)) {
    for (const m of pr.milestones) {
      for (const c of d.activeComms.filter((x) => x.milestone.id === m.id)) {
        planRows.push([c.rec.code, pr.phase.short, milestoneLabel(s, m), timingLabel(s, m), c.audience.roleName, OBJECTIVES[c.rec.objective],
          roleName(s, c.roles.primary) || 'Requires review', [c.channels.primary, ...c.channels.secondary].filter(Boolean).map((id) => s.channels.find((x) => x.id === id)?.name).join(', ') || '—',
          c.plannedDate ? fmtDate(c.plannedDate) : '—', COMM_STATUS_LABEL[c.rec.status]]);
      }
    }
  }
  const stage3: (Paragraph | Table)[] = [
    new Paragraph({ heading: HeadingLevel.HEADING_2, children: runs('Stage 3 — Change Management Plan') }),
    new Paragraph({ children: runs(`${d.activeComms.length} active communication records across ${d.activeMilestones.length} selected milestones.`) }),
    table(planRows),
    new Paragraph({ heading: HeadingLevel.HEADING_2, children: runs('Open issues and information gaps') }),
    ...(d.issues.length ? d.issues.slice(0, 60).map((i) => new Paragraph({ bullet: { level: 0 }, children: runs(`[${i.severity.toUpperCase()}] ${i.category}: ${i.message}`) })) : [new Paragraph('No open issues.')]),
  ];
  const landscape = { page: { size: { orientation: PageOrientation.LANDSCAPE } } };
  const doc = new Document({
    creator: 'GBS Change Intelligence', title: `${e.name} — Change Management Report`, styles: docStyles,
    sections: [
      { properties: {}, ...headerFooter(s, 'WORKING DRAFT'), children: intro },
      { properties: landscape, ...headerFooter(s, 'WORKING DRAFT'), children: stage2 },
      { properties: landscape, ...headerFooter(s, 'WORKING DRAFT'), children: stage3 },
    ],
  });
  return Packer.toBlob(doc);
}
