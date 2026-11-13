// XLSX (ExcelJS) and PPTX (PptxGenJS) exports. Matrices are built from the
// same derived records as the on-screen views. Nothing is truncated: large
// matrices are split across slides with headers and group context repeated.
import type { Channel, EngagementState } from '../domain/types';
import { ARCHETYPE_LABELS, CHANNEL_COLOR_LABEL, COMM_STATUS_LABEL, OBJECTIVES, REASON_LABELS } from '../domain/library';
import { fmtDate, formatT } from '../domain/util';
import { derive } from '../engine/derive';
import { roleName } from '../engine/communicator';
import { severityBand, severityScore } from '../engine/impact';
import { commCellText, groupMilestones, groupStakeholders, impactCellText, milestoneLabel, timingLabel, type CommMatrixKind } from '../engine/matrixText';
import { milestoneDate, milestoneOffset, waveName } from '../engine/timing';

export const CHANNEL_FILL: Record<Channel['color'], string> = {
  amber: 'FFE8B5', purple: 'E6DAF7', blue: 'D6E6F5', green: 'D5EFDF', yellow: 'FFF4B8', rose: 'F9D9DF',
  teal: 'D2EEEE', slate: 'E2E7EE', indigo: 'DEE1F7', brown: 'EADFD3',
};

type Wb = import('exceljs').Workbook;
type Ws = import('exceljs').Worksheet;

const NAVY = 'FF14263D', TEAL = 'FF087E88', PALE = 'FFEAF2F8', GREYF = 'FFEFF3F7', BORDER = 'FFDCE3EA';

async function workbook(): Promise<Wb> {
  const mod = await import('exceljs');
  const ExcelJS = (mod as unknown as { default?: typeof import('exceljs') }).default ?? mod;
  const wb = new ExcelJS.Workbook();
  wb.creator = 'GBS Change Intelligence';
  wb.created = new Date();
  return wb;
}

function titleRows(ws: Ws, s: EngagementState, title: string, subtitle: string, width: number) {
  ws.addRow([title]).font = { bold: true, size: 14, color: { argb: NAVY } };
  ws.addRow([subtitle]).font = { italic: true, size: 10, color: { argb: 'FF617186' } };
  ws.addRow([`${s.engagement.name}${s.engagement.isDemo ? ' — DEMONSTRATION DATA' : ''} · ${s.engagement.confidentiality} · Exported ${fmtDate(new Date().toISOString().slice(0, 10))}`]).font = { size: 9, color: { argb: 'FF617186' } };
  ws.addRow([]);
  void width;
}

function headerRow(ws: Ws, values: string[]) {
  const r = ws.addRow(values);
  r.eachCell((c) => {
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } };
    c.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
    c.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    c.border = { top: { style: 'thin', color: { argb: BORDER } }, bottom: { style: 'thin', color: { argb: BORDER } }, left: { style: 'thin', color: { argb: BORDER } }, right: { style: 'thin', color: { argb: BORDER } } };
  });
  r.height = 42;
  return r;
}

function groupRow(ws: Ws, label: string, width: number) {
  const r = ws.addRow([label]);
  for (let i = 1; i <= width; i++) {
    const c = r.getCell(i);
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: TEAL } };
    c.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
  }
  return r;
}

function bodyRow(ws: Ws, values: (string | number | null)[], zebra: boolean) {
  const r = ws.addRow(values);
  r.eachCell({ includeEmpty: true }, (c) => {
    c.alignment = { vertical: 'top', wrapText: true };
    c.font = { size: 10 };
    c.border = { bottom: { style: 'thin', color: { argb: BORDER } }, right: { style: 'thin', color: { argb: BORDER } } };
    if (zebra) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
  });
  return r;
}

function tableSheet(wb: Wb, s: EngagementState, name: string, title: string, subtitle: string, header: string[], rows: (string | number | null)[][], widths: number[]) {
  const ws = wb.addWorksheet(name.slice(0, 31), { views: [{ state: 'frozen', ySplit: 5, xSplit: 1 }] });
  titleRows(ws, s, title, subtitle, header.length);
  headerRow(ws, header);
  rows.forEach((r, i) => bodyRow(ws, r, i % 2 === 1));
  widths.forEach((w, i) => (ws.getColumn(i + 1).width = w));
  ws.autoFilter = { from: { row: 5, column: 1 }, to: { row: 5, column: header.length } };
  return ws;
}

// ----------------------------- Sheets --------------------------------------

function stakeholderSheet(wb: Wb, s: EngagementState) {
  const d = derive(s);
  const rows = d.selectedStakeholders.map((st) => {
    const g = s.groups.find((x) => x.id === st.groupId);
    const roles = Object.entries(st.roles).filter(([, v]) => v).map(([k]) => k.replace(/([A-Z])/g, ' $1').toLowerCase()).join(', ');
    return [st.roleName, g ? `${g.code}. ${g.name}` : '', ARCHETYPE_LABELS[st.archetype], st.entity, st.functionName || 'Cross-functional', st.geography,
      st.waveIds.map((w) => waveName(s, w)).join(', ') || 'All waves', st.population, st.influence ?? '', st.readiness, roles, st.owner, st.notes];
  });
  tableSheet(wb, s, 'Stakeholder Register', 'Stakeholder Register', 'Stakeholders selected for this engagement.',
    ['Stakeholder', 'Group', 'Archetype', 'Entity', 'Function', 'Geography', 'Waves', 'Population', 'Influence', 'Readiness', 'Roles', 'Owner', 'Notes'], rows,
    [36, 28, 22, 18, 20, 20, 18, 11, 10, 11, 34, 18, 36]);
}

function changeSheet(wb: Wb, s: EngagementState) {
  const rows = s.changes.map((c) => [c.code, c.active ? 'In scope' : 'Removed', c.source === 'template' ? 'Library' : 'Custom', c.templateId ?? '', c.templateVersion ?? '',
    s.dimensions.find((x) => x.id === c.dimensionId)?.short ?? '', c.title, c.customDescription || c.description, c.asIs, c.toBe, c.source === 'template' && !c.defaultsReviewed ? 'Library default — confirm' : 'Reviewed',
    c.notChanging, c.rationale, c.functionTags.join(', ') || 'All in-scope', c.processTags.join(', '), c.geography, c.entities.join(', '), c.effectiveDate ?? '',
    s.milestones.find((m) => m.id === c.milestoneId)?.name ?? '', c.waveIds.map((w) => waveName(s, w)).join(', ') || 'All waves',
    Object.entries(c.clarificationAnswers ?? {}).map(([q, a]) => `${q}=${a}`).join('; '), c.peopleAffected, c.owner, c.operationalImpact, c.behaviouralImpact,
    c.dependencies, c.assumptions, c.evidence, c.status]);
  tableSheet(wb, s, 'Change Register', 'Change Register', 'Library-derived and custom change records by change dimension.',
    ['ID', 'Scope', 'Source', 'Template', 'Version', 'Dimension', 'Title', 'Description', 'As-Is', 'To-Be', 'Description status', 'Not changing', 'Rationale', 'Functions', 'Processes', 'Geography', 'Entities', 'Effective', 'Milestone', 'Waves', 'Clarifications', 'People', 'Owner', 'Operational impact', 'Behavioural impact', 'Dependencies', 'Assumptions', 'Evidence', 'Status'],
    rows, [10, 10, 9, 11, 8, 16, 36, 36, 30, 30, 16, 24, 26, 18, 20, 14, 16, 12, 22, 16, 30, 8, 16, 24, 24, 20, 30, 26, 12]);
}

function impactSheets(wb: Wb, s: EngagementState) {
  const d = derive(s);
  const dims = d.selectedDims;
  const ws = wb.addWorksheet('Impact Matrix', { views: [{ state: 'frozen', ySplit: 5, xSplit: 1 }] });
  titleRows(ws, s, 'Stakeholder Change Impact Assessment', 'Assessment of how stakeholder groups are impacted across key change dimensions. ✓ Impacted · × Not impacted · ? Requires review.', dims.length + 1);
  headerRow(ws, ['Stakeholder', ...dims.map((x) => x.label)]);
  for (const g of groupStakeholders(s, d.selectedStakeholders)) {
    groupRow(ws, `${g.group.code}. ${g.group.name}`, dims.length + 1);
    g.members.forEach((st, i) => {
      const r = bodyRow(ws, [st.roleName, ...dims.map((dim) => impactCellText(d, st.id, dim.id))], i % 2 === 1);
      dims.forEach((dim, j) => {
        const e = d.impacts.get(`${st.id}|${dim.id}`);
        const c = r.getCell(j + 2);
        c.alignment = { horizontal: 'center', vertical: 'middle' };
        c.font = { bold: true, size: 12, color: { argb: e?.classification === 'impacted' ? 'FF1E7B4A' : e?.classification === 'review' ? 'FFB7791F' : 'FF9AA5B1' } };
        if (e?.source === 'consultant') c.note = 'Consultant decision';
      });
    });
  }
  ws.getColumn(1).width = 44;
  dims.forEach((_, i) => (ws.getColumn(i + 2).width = 22));

  const rows: (string | number | null)[][] = [];
  for (const st of d.selectedStakeholders) for (const dim of dims) {
    const k = `${st.id}|${dim.id}`;
    const rec = d.impactRecs.get(k)!; const e = d.impacts.get(k)!; const a = s.assessments[k];
    const score = severityScore(e.severity, s.engagement.settings.weights);
    rows.push([st.roleName, dim.short, e.classification.replace('_', ' '), e.directness ?? '', e.severity?.responsibilities ?? '', e.severity?.relationships ?? '', e.severity?.tools ?? '', e.severity?.behaviours ?? '',
      score === null ? 'Not scored' : score.toFixed(2), severityBand(score, s.engagement.settings.thresholds) ?? '', e.source === 'consultant' ? 'Consultant decision' : 'Rule recommendation',
      e.status.replace('_', ' '), a?.decision?.rationale || rec.rationale.join(' '), rec.changeIds.map((id) => s.changes.find((c) => c.id === id)?.code).join(', '), rec.gaps.join(' '), rec.confidence]);
  }
  tableSheet(wb, s, 'Impact Detail', 'Impact Assessment — Detail and Severity', 'Severity scored 0–3 per dimension only when As-Is/To-Be information exists.',
    ['Stakeholder', 'Dimension', 'Classification', 'Directness', 'Responsibilities', 'Relationships', 'Tools/process', 'Behaviours', 'Weighted score', 'Band', 'Source', 'Status', 'Rationale', 'Change IDs', 'Information gaps', 'Evidence sufficiency'],
    rows, [36, 18, 14, 11, 9, 9, 9, 9, 10, 9, 18, 13, 60, 16, 40, 12]);
}

function milestoneSheet(wb: Wb, s: EngagementState) {
  const d = derive(s);
  const rows = d.activeMilestones.map((m) => [s.phases.find((p) => p.id === m.phaseId)?.name ?? '', milestoneLabel(s, m), m.kind, waveName(s, m.waveId),
    milestoneDate(s, m) ?? '', m.kind === 'milestone' ? formatT(milestoneOffset(s, m)) : timingLabel(s, m), m.owner, m.dependencies.map((id) => s.milestones.find((x) => x.id === id)?.name).filter(Boolean).join(', '), m.gating,
    m.trigger.required ? 'Yes' : 'No', m.trigger.objective, d.activeComms.filter((c) => c.milestone.id === m.id).length]);
  tableSheet(wb, s, 'Milestone Plan', 'GBS Milestone & Transition Plan', `Relative timing in ${s.engagement.timeUnit} against the relevant wave go-live (T).`,
    ['Phase', 'Milestone', 'Type', 'Wave', 'Date', 'Timing', 'Owner', 'Dependencies', 'Gating conditions', 'Communication required', 'Communication objective', 'Planned communications'],
    rows, [32, 40, 11, 18, 12, 9, 18, 28, 30, 12, 40, 12]);
}

function commMatrixSheet(wb: Wb, s: EngagementState, kind: CommMatrixKind) {
  const d = derive(s);
  const sts = d.selectedStakeholders;
  const name = kind === 'audience' ? 'Audience Matrix' : kind === 'communicator' ? 'Communicator Matrix' : 'Channel Matrix';
  const sub = kind === 'audience' ? 'Who needs to be communicated with at each milestone. ✓ Communication planned · ? Unresolved recommendation.'
    : kind === 'communicator' ? 'Primary communicator for each milestone and audience (+ supporting communicators).'
    : 'Primary channel per milestone and audience (+n additional channels). Fill colour indicates channel family.';
  const ws = wb.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 5, xSplit: 3 }] });
  titleRows(ws, s, name, sub, sts.length + 3);
  headerRow(ws, ['Phase', 'Milestone / event', 'Time to go-live', ...sts.map((x) => x.roleName)]);
  for (const pr of groupMilestones(s, d.activeMilestones)) {
    groupRow(ws, `Phase ${pr.phase.num} — ${pr.phase.name}`, sts.length + 3);
    pr.milestones.forEach((m, i) => {
      const vals = sts.map((st) => commCellText(s, d, kind, m.id, st.id));
      const r = bodyRow(ws, [pr.phase.short, milestoneLabel(s, m), timingLabel(s, m), ...vals], i % 2 === 1);
      sts.forEach((st, j) => {
        const c = r.getCell(j + 4);
        c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
        const cs = d.commsByCell.get(`${m.id}|${st.id}`)?.filter((x) => x.active) ?? [];
        if (kind === 'audience' && cs.length) c.font = { bold: true, size: 12, color: { argb: cs.every((x) => x.rec.status === 'proposed') ? 'FF245A81' : 'FF14263D' } };
        if (kind === 'channel' && cs[0]?.channels.primary) {
          const ch = s.channels.find((x) => x.id === cs[0].channels.primary);
          if (ch) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${CHANNEL_FILL[ch.color]}` } };
          c.font = { size: 9 };
        }
        if (kind === 'communicator') c.font = { size: 9 };
      });
    });
  }
  ws.getColumn(1).width = 14; ws.getColumn(2).width = 42; ws.getColumn(3).width = 10;
  sts.forEach((_, i) => (ws.getColumn(i + 4).width = kind === 'audience' ? 12 : 18));
  if (kind === 'channel') {
    ws.addRow([]);
    ws.addRow(['Legend']).font = { bold: true };
    for (const [color, label] of Object.entries(CHANNEL_COLOR_LABEL)) {
      const r = ws.addRow(['', label]);
      r.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${CHANNEL_FILL[color as Channel['color']]}` } };
    }
  }
  if (kind === 'audience') {
    const rows: (string | number | null)[][] = [];
    for (const c of d.activeComms) rows.push([c.rec.code, milestoneLabel(s, c.milestone), c.audience.roleName, OBJECTIVES[c.rec.objective],
      (c.audienceRec?.reasons ?? []).map((r) => `${REASON_LABELS[r.kind]}: ${r.text}`).join(' | ') || c.rec.manualReason || 'Added by consultant', c.rec.intendedOutcome, COMM_STATUS_LABEL[c.rec.status]]);
    tableSheet(wb, s, 'Audience Rationale', 'Audience selection rationale', 'Why each audience was selected.', ['ID', 'Milestone', 'Audience', 'Objective', 'Reasons', 'Intended outcome', 'Status'], rows, [10, 36, 32, 14, 70, 40, 16]);
  }
}

function planSheet(wb: Wb, s: EngagementState) {
  const d = derive(s);
  const ch = (id: string | null) => (id ? s.channels.find((x) => x.id === id)?.name ?? '' : '');
  const rows = d.activeComms.map((c) => [c.rec.code, s.phases.find((p) => p.id === c.milestone.phaseId)?.short ?? '', milestoneLabel(s, c.milestone), waveName(s, c.milestone.waveId),
    c.audience.roleName, OBJECTIVES[c.rec.objective], s.commTypes.find((t) => t.id === c.rec.commTypeId)?.name ?? '', c.rec.priority, c.sensitive ? 'High' : 'Standard',
    roleName(s, c.roles.primary) || 'Requires review', c.roles.supporting.map((r) => roleName(s, r)).join(', '), roleName(s, c.roles.owner), roleName(s, c.roles.creator), c.roles.approvers.map((r) => roleName(s, r)).join(', '),
    ch(c.channels.primary), c.channels.secondary.map(ch).join(', '), ch(c.channels.reinforcement), ch(c.channels.followUp), c.brief.mainMessage,
    c.artifactTypes[0] ?? '', c.plannedDate ?? '', c.milestone.kind === 'milestone' ? formatT(c.offset) : timingLabel(s, c.milestone), c.milestone.recurrence?.cadence ?? '', c.milestone.recurrence?.until ?? '',
    COMM_STATUS_LABEL[c.rec.status], c.rec.commTypeId === 'ct_sensitive' ? (c.rec.hrReviewed ? 'HR reviewed' : 'HR review pending') : '',
    c.artifacts.map((a) => a.code).join(', '), c.changes.map((x) => x.code).join(', '), [c.rolesOverridden && 'communicator', c.channelsOverridden && 'channel', c.messageOverridden && 'message', c.rec.plannedDateOverride && 'date'].filter(Boolean).join(', '),
    c.readinessGaps.join(' '), c.rec.updatedAt.slice(0, 10)]);
  tableSheet(wb, s, 'Master Communication Plan', 'Master Communication Plan', 'Consolidated plan generated from audience, communicator, channel, and messaging records.',
    ['ID', 'Phase', 'Milestone', 'Wave', 'Audience', 'Objective', 'Type', 'Priority', 'Sensitivity', 'Primary communicator', 'Supporting', 'Owner', 'Content creator', 'Approver(s)', 'Primary channel', 'Secondary', 'Reinforcement', 'Follow-up', 'Key message', 'Artifact type', 'Planned date', 'Timing', 'Cadence', 'Recurrence end', 'Status', 'HR review', 'Artifacts', 'Change IDs', 'Overrides', 'Readiness gaps', 'Last modified'],
    rows, [10, 12, 34, 16, 30, 13, 20, 9, 10, 22, 22, 20, 20, 26, 20, 22, 16, 16, 60, 18, 12, 9, 10, 16, 16, 14, 12, 14, 18, 40, 12]);
}

export type XlsxDeliverable = 'stakeholders' | 'changes' | 'impact' | 'milestones' | 'audience' | 'communicator' | 'channel' | 'plan' | 'all';

export async function buildXlsx(s: EngagementState, which: XlsxDeliverable): Promise<Blob> {
  const wb = await workbook();
  const all = which === 'all';
  if (all || which === 'stakeholders') stakeholderSheet(wb, s);
  if (all || which === 'changes') changeSheet(wb, s);
  if (all || which === 'impact') impactSheets(wb, s);
  if (all || which === 'milestones') milestoneSheet(wb, s);
  if (all || which === 'audience') commMatrixSheet(wb, s, 'audience');
  if (all || which === 'communicator') commMatrixSheet(wb, s, 'communicator');
  if (all || which === 'channel') commMatrixSheet(wb, s, 'channel');
  if (all || which === 'plan') planSheet(wb, s);
  const buf = await wb.xlsx.writeBuffer();
  return new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

// ----------------------------- PPTX ----------------------------------------

type Pres = import('pptxgenjs').default;
type Slide = import('pptxgenjs').default.Slide;
type TableRowP = import('pptxgenjs').default.TableRow;

async function pres(s: EngagementState): Promise<Pres> {
  const mod = await import('pptxgenjs');
  const P = (mod as unknown as { default: new () => Pres }).default;
  const p = new P();
  p.layout = 'LAYOUT_WIDE';
  p.title = s.engagement.name;
  p.company = 'GBS Change Intelligence';
  return p;
}

function slideFrame(p: Pres, s: EngagementState, title: string, subtitle: string): Slide {
  const sl = p.addSlide();
  sl.background = { color: 'FFFFFF' };
  sl.addText(title, { x: 0.4, y: 0.25, w: 12.5, h: 0.5, fontSize: 20, bold: true, color: '14263D', fontFace: 'Calibri' });
  sl.addText(subtitle, { x: 0.4, y: 0.72, w: 12.5, h: 0.35, fontSize: 11, color: '617186', fontFace: 'Calibri', italic: true });
  sl.addText(`${s.engagement.name}${s.engagement.isDemo ? ' · Demonstration data' : ''} · ${s.engagement.confidentiality}`, { x: 0.4, y: 7.05, w: 12.5, h: 0.3, fontSize: 8, color: '617186', fontFace: 'Calibri' });
  return sl;
}

const hdr = (t: string) => ({ text: t, options: { bold: true, color: 'FFFFFF', fill: { color: '14263D' }, fontSize: 8, align: 'center' as const, valign: 'middle' as const } });

function chunk<T>(a: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < a.length; i += n) out.push(a.slice(i, i + n));
  return out.length ? out : [[]];
}

function impactSlides(p: Pres, s: EngagementState) {
  const d = derive(s);
  type R = { group?: string; st?: (typeof d.selectedStakeholders)[number] };
  const flat: R[] = [];
  for (const g of groupStakeholders(s, d.selectedStakeholders)) { flat.push({ group: `${g.group.code}. ${g.group.name}` }); g.members.forEach((st) => flat.push({ st })); }
  const pages = chunk(flat, 16);
  pages.forEach((rows, i) => {
    const sl = slideFrame(p, s, `Stakeholder Change Impact Assessment${pages.length > 1 ? ` (${i + 1}/${pages.length})` : ''}`, 'Assessment of how stakeholder groups are impacted across key change dimensions. ✓ Impacted · × Not impacted · ? Requires review');
    const table: TableRowP[] = [[hdr('Stakeholder'), ...d.selectedDims.map((x) => hdr(x.label))]];
    if (rows[0] && !rows[0].group) table.push([{ text: '(continued)', options: { color: 'FFFFFF', fill: { color: '087E88' }, fontSize: 8, colspan: d.selectedDims.length + 1 } }]);
    rows.forEach((r, j) => {
      if (r.group) table.push([{ text: r.group, options: { bold: true, color: 'FFFFFF', fill: { color: '087E88' }, fontSize: 8, colspan: d.selectedDims.length + 1 } }]);
      else table.push([{ text: r.st!.roleName, options: { fontSize: 8, fill: { color: j % 2 ? 'F6F8FB' : 'FFFFFF' } } }, ...d.selectedDims.map((dim) => {
        const e = d.impacts.get(`${r.st!.id}|${dim.id}`);
        return { text: impactCellText(d, r.st!.id, dim.id), options: { align: 'center' as const, bold: true, fontSize: 11, color: e?.classification === 'impacted' ? '1E7B4A' : e?.classification === 'review' ? 'B7791F' : '9AA5B1', fill: { color: j % 2 ? 'F6F8FB' : 'FFFFFF' } } };
      })]);
    });
    sl.addTable(table, { x: 0.4, y: 1.15, w: 12.5, colW: [4, ...d.selectedDims.map(() => 8.5 / Math.max(1, d.selectedDims.length))], border: { type: 'solid', pt: 0.5, color: 'DCE3EA' }, fontFace: 'Calibri', rowH: 0.3 });
  });
}

function commMatrixSlides(p: Pres, s: EngagementState, kind: CommMatrixKind) {
  const d = derive(s);
  const colPages = chunk(d.selectedStakeholders, kind === 'audience' ? 12 : 8);
  type R = { phase?: string; m?: (typeof d.activeMilestones)[number] };
  const flat: R[] = [];
  for (const pr of groupMilestones(s, d.activeMilestones)) { flat.push({ phase: `Phase ${pr.phase.num} — ${pr.phase.name}` }); pr.milestones.forEach((m) => flat.push({ m })); }
  const rowPages = chunk(flat, kind === 'audience' ? 16 : 12);
  const title = kind === 'audience' ? 'To Be Communicated With — Audience Matrix' : kind === 'communicator' ? 'Communicator Matrix' : 'Communication Channel Matrix';
  const total = colPages.length * rowPages.length;
  let n = 0;
  for (const rows of rowPages) for (const cols of colPages) {
    n += 1;
    const sl = slideFrame(p, s, `${title}${total > 1 ? ` (${n}/${total})` : ''}`, kind === 'audience' ? '✓ Communication planned · ? Unresolved recommendation' : kind === 'communicator' ? 'Primary communicator (+ supporting)' : 'Primary channel (+n additional channels); colour = channel family');
    const table: TableRowP[] = [[hdr('Milestone / event'), hdr('Timing'), ...cols.map((st) => hdr(st.roleName))]];
    rows.forEach((r, j) => {
      if (r.phase) { table.push([{ text: r.phase, options: { bold: true, color: 'FFFFFF', fill: { color: '087E88' }, fontSize: 8, colspan: cols.length + 2 } }]); return; }
      const m = r.m!;
      table.push([
        { text: milestoneLabel(s, m), options: { fontSize: 7.5, fill: { color: j % 2 ? 'F6F8FB' : 'FFFFFF' } } },
        { text: timingLabel(s, m), options: { fontSize: 7.5, align: 'center' as const, fill: { color: j % 2 ? 'F6F8FB' : 'FFFFFF' } } },
        ...cols.map((st) => {
          const text = commCellText(s, d, kind, m.id, st.id);
          const cs = d.commsByCell.get(`${m.id}|${st.id}`)?.filter((x) => x.active) ?? [];
          const ch = kind === 'channel' && cs[0]?.channels.primary ? s.channels.find((x) => x.id === cs[0].channels.primary) : null;
          return { text, options: { fontSize: kind === 'audience' ? 10 : 6.5, bold: kind === 'audience', align: 'center' as const, valign: 'middle' as const, color: '14263D', fill: { color: ch ? CHANNEL_FILL[ch.color] : j % 2 ? 'F6F8FB' : 'FFFFFF' } } };
        }),
      ]);
    });
    const colW = (12.5 - 4.2) / Math.max(1, cols.length);
    sl.addTable(table, { x: 0.4, y: 1.15, w: 12.5, colW: [3.5, 0.7, ...cols.map(() => colW)], border: { type: 'solid', pt: 0.5, color: 'DCE3EA' }, fontFace: 'Calibri' });
  }
}

function roadmapSlide(p: Pres, s: EngagementState) {
  const d = derive(s);
  const sl = slideFrame(p, s, 'GBS Milestone Roadmap', `Selected milestones by phase; relative timing in ${s.engagement.timeUnit} to the relevant wave go-live`);
  const phases = s.phases;
  const w = 12.5 / phases.length;
  phases.forEach((ph, i) => {
    sl.addShape('rect', { x: 0.4 + i * w, y: 1.2, w: w - 0.06, h: 0.5, fill: { color: i === phases.length - 2 ? '087E88' : '14263D' } });
    sl.addText(`${ph.num}. ${ph.name}`, { x: 0.4 + i * w, y: 1.2, w: w - 0.06, h: 0.5, fontSize: 9, bold: true, color: 'FFFFFF', align: 'center', fontFace: 'Calibri' });
    const items = d.activeMilestones.filter((m) => m.phaseId === ph.id && m.kind === 'milestone');
    const lines = items.map((m) => `${milestoneLabel(s, m)} — ${timingLabel(s, m)}${milestoneDate(s, m) ? ` (${fmtDate(milestoneDate(s, m))})` : ''}`);
    sl.addText(lines.length ? lines.map((t) => ({ text: t, options: { bullet: true, breakLine: true } })) : [{ text: 'No milestones selected', options: { italic: true } }],
      { x: 0.4 + i * w, y: 1.8, w: w - 0.06, h: 5, fontSize: 8, color: '172536', valign: 'top', fontFace: 'Calibri' });
  });
}

function summarySlide(p: Pres, s: EngagementState) {
  const d = derive(s);
  const sl = slideFrame(p, s, 'Executive Summary', 'Computed from engagement records at export time');
  const impacted = d.selectedStakeholders.filter((st) => d.selectedDims.some((dim) => d.impacts.get(`${st.id}|${dim.id}`)?.classification === 'impacted')).length;
  const kpis: [string, string][] = [
    ['Change records', String(s.changes.length)], ['Stakeholder groups', String(d.selectedStakeholders.length)], ['Impacted groups', String(impacted)],
    ['Selected milestones', String(d.activeMilestones.length)], ['Active communications', String(d.activeComms.length)], ['Artifacts', String(s.artifacts.length)],
  ];
  kpis.forEach(([k, v], i) => {
    const x = 0.4 + (i % 3) * 4.2, y = 1.3 + Math.floor(i / 3) * 1.4;
    sl.addShape('rect', { x, y, w: 4, h: 1.2, fill: { color: 'EAF2F8' }, line: { color: 'DCE3EA' } });
    sl.addText(v, { x, y: y + 0.1, w: 4, h: 0.6, fontSize: 28, bold: true, color: '14263D', align: 'center', fontFace: 'Calibri' });
    sl.addText(k, { x, y: y + 0.72, w: 4, h: 0.4, fontSize: 11, color: '617186', align: 'center', fontFace: 'Calibri' });
  });
  const top = d.issues.slice(0, 8).map((i) => ({ text: `[${i.severity}] ${i.message}`, options: { bullet: true, breakLine: true } }));
  sl.addText('Open issues', { x: 0.4, y: 4.2, w: 12.5, h: 0.35, fontSize: 13, bold: true, color: '14263D', fontFace: 'Calibri' });
  sl.addText(top.length ? top : [{ text: 'No open issues', options: {} }], { x: 0.4, y: 4.55, w: 12.5, h: 2.4, fontSize: 9, color: '172536', valign: 'top', fontFace: 'Calibri' });
}

export type PptxDeliverable = 'impact' | 'audience' | 'communicator' | 'channel' | 'roadmap' | 'summary' | 'all';

export async function buildPptx(s: EngagementState, which: PptxDeliverable): Promise<Blob> {
  const p = await pres(s);
  const all = which === 'all';
  if (all || which === 'summary') summarySlide(p, s);
  if (all || which === 'roadmap') roadmapSlide(p, s);
  if (all || which === 'impact') impactSlides(p, s);
  if (all || which === 'audience') commMatrixSlides(p, s, 'audience');
  if (all || which === 'communicator') commMatrixSlides(p, s, 'communicator');
  if (all || which === 'channel') commMatrixSlides(p, s, 'channel');
  return (await p.write({ outputType: 'blob', compression: true })) as Blob;
}

/** Training deck (PPTX) from a training pack artifact's storyboard — supplements the required Word version. */
export async function trainingDeckPptx(s: EngagementState, title: string, sections: { heading: string; body: string }[]): Promise<Blob> {
  const p = await pres(s);
  const t = p.addSlide();
  t.background = { color: '14263D' };
  t.addText(title, { x: 0.6, y: 2.6, w: 12, h: 1, fontSize: 30, bold: true, color: 'FFFFFF', fontFace: 'Calibri' });
  t.addText(`${s.engagement.name} · Draft training deck`, { x: 0.6, y: 3.6, w: 12, h: 0.5, fontSize: 14, color: 'EAF2F8', fontFace: 'Calibri' });
  for (const sec of sections) {
    const sl = slideFrame(p, s, sec.heading, 'Draft — for review');
    const lines = sec.body.split('\n').filter((x) => x.trim() && !x.trim().startsWith('|')).slice(0, 14).map((x) => ({ text: x.replace(/^- |^### |\*\*/g, ''), options: { bullet: x.startsWith('- '), breakLine: true } }));
    sl.addText(lines.length ? lines : [{ text: '(See Word training pack for tabular content.)', options: {} }], { x: 0.5, y: 1.2, w: 12.3, h: 5.6, fontSize: 13, color: '172536', valign: 'top', fontFace: 'Calibri' });
  }
  return (await p.write({ outputType: 'blob', compression: true })) as Blob;
}
