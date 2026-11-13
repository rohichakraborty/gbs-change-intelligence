// AI change-identification actions. Generation results are persisted in the
// engagement (aiGenerations). Selecting a generated change goes through the same
// selection path as library templates, so the downstream engine treats both alike.
import type { AIDim, AIGeneration, AIStep, Archetype, ChangePack, EngagementState, RoleSuggestion, Stakeholder } from '../domain/types';
import { nowIso, uid, slug } from '../domain/util';
import { STAKEHOLDER_LIBRARY } from '../domain/library';
import { similarity } from '../catalogue/instance';
import type { AIRole, ChangeTemplate, DimCode } from '../catalogue/types';
import { AIError, type LLMProvider } from '../ai/providers';
import { checkFunctionName, DIMS, generateDimension, generateRoles } from '../ai/generate';
import type { GenerationInput } from '../ai/prompts';
import { ensureRoleSuggestions } from './roleRegister';
export { ensureRoleSuggestions };
import { saveTemplateVersion, setTemplatesSelected } from './changeActions';
import { useApp } from './store';

const app = () => useApp.getState();
const cur = () => app().current!;

function patchGen(id: string, fn: (g: AIGeneration) => void) {
  app().patchCurrent((d) => { const g = d.aiGenerations.find((x) => x.id === id); if (g) fn(g as AIGeneration); });
}
function log(entry: Omit<EngagementState['aiLog'][number], 'at'>) {
  app().patchCurrent((d) => { d.aiLog.unshift({ at: nowIso(), ...entry }); if (d.aiLog.length > 300) d.aiLog.length = 300; });
}

export interface RunOptions { signal?: AbortSignal; dims?: DimCode[] }

/** Full generation: roles first, then each dimension. Failures are recorded per step and never replaced by canned data. */
export async function runGeneration(provider: LLMProvider, raw: GenerationInput, opts: RunOptions = {}): Promise<string> {
  const fn = checkFunctionName(raw.function);
  const input: GenerationInput = { ...raw, function: fn };
  const id = uid('gen');
  const short = id.slice(-4).toUpperCase();
  const dims = opts.dims ?? DIMS;
  const steps: AIStep[] = (['roles', ...dims] as AIStep['key'][]).map((key) => ({ key, status: 'pending', attempts: 0, valid: 0, rejected: [], duplicates: 0, error: null, at: null }));
  app().mutate((d) => {
    if (!d.engagement.functions.some((f) => f.name.toLowerCase() === fn.toLowerCase())) d.engagement.functions.push({ id: uid('fn'), name: fn, approach: 'To be determined' });
    d.aiGenerations.unshift({ id, function: fn, functionDescription: input.functionDescription, processes: input.processes, technologies: input.technologies, createdAt: nowIso(),
      provider: provider.label, model: '', status: 'running', interpretation: '', clarityWarning: null, steps, roles: [], candidates: [] });
  }, { entityType: 'ai', entityId: id, action: 'generate', summary: `AI change generation started for ${fn}` });

  const setStep = (key: AIStep['key'], patch: Partial<AIStep>) => patchGen(id, (g) => { const st = g.steps.find((x) => x.key === key)!; Object.assign(st, patch, { at: nowIso() }); });
  let failed = 0;
  // 1. Roles
  setStep('roles', { status: 'running' });
  const t0 = performance.now();
  try {
    const r = await generateRoles(provider, cur(), input, opts.signal);
    patchGen(id, (g) => { g.roles = r.roles; g.interpretation = r.interpretation; g.clarityWarning = r.clarityWarning; g.model = r.model; });
    app().patchCurrent((d) => ensureRoleSuggestions(d as EngagementState, r.roles, fn, id));
    setStep('roles', { status: 'ok', attempts: r.attempts, valid: r.roles.length, rejected: r.rejected });
    log({ provider: provider.label, model: r.model, purpose: 'roles', function: fn, ok: true, attempts: r.attempts, ms: Math.round(performance.now() - t0), error: null });
  } catch (e) {
    const msg = (e as Error).message;
    setStep('roles', { status: 'failed', error: msg });
    patchGen(id, (g) => { g.status = 'failed'; });
    log({ provider: provider.label, model: '', purpose: 'roles', function: fn, ok: false, attempts: 0, ms: Math.round(performance.now() - t0), error: msg });
    throw e;
  }
  // 2. Dimensions
  for (const dim of dims) {
    if (opts.signal?.aborted) { setStep(dim, { status: 'failed', error: 'Cancelled' }); failed++; continue; }
    await runDimension(provider, id, dim, 'initial', opts.signal).catch(() => { failed++; });
  }
  patchGen(id, (g) => { g.status = failed === 0 ? 'complete' : failed >= dims.length ? 'failed' : 'partial'; });
  const g = cur().aiGenerations.find((x) => x.id === id)!;
  app().mutate(() => { /* audit only */ }, { entityType: 'ai', entityId: id, action: 'generated', summary: `AI generated ${g.candidates.length} candidate change(s) for ${fn} (${g.status})` });
  return id;
}

/** Generate (or add more / regenerate) one dimension of an existing generation. */
export async function runDimension(provider: LLMProvider, genId: string, dim: DimCode, mode: 'initial' | 'more' | 'replace', signal?: AbortSignal) {
  const s0 = cur();
  const g0 = s0.aiGenerations.find((x) => x.id === genId);
  if (!g0) throw new AIError('bad_input', 'Generation not found');
  const selectedIds = new Set(s0.changes.filter((c) => c.active && c.templateId).map((c) => c.templateId));
  if (mode === 'replace') patchGen(genId, (g) => { g.candidates = g.candidates.filter((c) => c.dim !== dim || selectedIds.has(c.id)); });
  const g = cur().aiGenerations.find((x) => x.id === genId)!;
  // Duplicates are judged within the same function: similar wording for another function is a different change.
  const sameFn = (tags: string[]) => tags.some((t) => t.toLowerCase() === g.function.toLowerCase());
  const avoid = [...g.candidates.filter((c) => c.status === 'candidate').map((c) => c.template.title), ...s0.changes.filter((c) => c.active && sameFn(c.functionTags)).map((c) => c.title)];
  const input: GenerationInput = { function: g.function, functionDescription: g.functionDescription, processes: g.processes, technologies: g.technologies, documentExcerpt: '' };
  let n = g.candidates.filter((c) => c.dim === dim).length;
  const short = genId.slice(-4).toUpperCase();
  const setStep = (patch: Partial<AIStep>) => patchGen(genId, (gg) => {
    let st = gg.steps.find((x) => x.key === dim);
    if (!st) { st = { key: dim, status: 'pending', attempts: 0, valid: 0, rejected: [], duplicates: 0, error: null, at: null }; gg.steps.push(st); }
    Object.assign(st, patch, { at: nowIso() });
  });
  setStep({ status: 'running', error: null });
  const t0 = performance.now();
  try {
    const r = await generateDimension(provider, cur(), input, dim, g.roles, avoid, mode === 'initial' ? 'initial' : 'more',
      { generationId: genId, next: (dd) => `AI-${short}-${dd}-${String(++n + Math.floor(Math.random() * 0)).padStart(3, '0')}` }, signal);
    patchGen(genId, (gg) => {
      gg.roles.push(...r.newRoles.filter((x) => !gg.roles.some((y) => y.key === x.key)));
      gg.candidates.push(...r.templates.map((t) => ({ id: t.templateId, dim, status: 'candidate' as const, edited: false, template: t })));
      if (!gg.model) gg.model = r.model;
    });
    if (r.newRoles.length) app().patchCurrent((d) => ensureRoleSuggestions(d as EngagementState, r.newRoles, g.function, genId));
    setStep({ status: 'ok', attempts: r.attempts, valid: r.templates.length, rejected: r.rejected, duplicates: r.duplicates });
    log({ provider: provider.label, model: r.model, purpose: `changes:${dim}:${mode}`, function: g.function, ok: true, attempts: r.attempts, ms: Math.round(performance.now() - t0), error: null });
    return r.templates.length;
  } catch (e) {
    const msg = (e as Error).message;
    setStep({ status: 'failed', error: msg });
    log({ provider: provider.label, model: '', purpose: `changes:${dim}:${mode}`, function: g.function, ok: false, attempts: 0, ms: Math.round(performance.now() - t0), error: msg });
    throw e;
  }
}

export function selectCandidates(ids: string[], on: boolean) {
  return setTemplatesSelected(ids, on);
}

export function editCandidate(genId: string, candId: string, patch: Partial<Pick<ChangeTemplate, 'title' | 'description' | 'typicalAsIs' | 'typicalToBe' | 'processTags'>>) {
  if (cur().changes.some((c) => c.templateId === candId)) throw new AIError('bad_input', 'This change is already in the Change Register — edit it there.');
  app().mutate((d) => {
    const c = d.aiGenerations.find((g) => g.id === genId)?.candidates.find((x) => x.id === candId);
    if (!c) return;
    Object.assign(c.template, patch);
    c.edited = true;
  }, { entityType: 'ai', entityId: candId, action: 'edit', summary: 'Generated change edited before selection' });
}

export function setCandidatesRemoved(genId: string, ids: string[], removed: boolean) {
  app().mutate((d) => {
    for (const c of d.aiGenerations.find((g) => g.id === genId)?.candidates ?? []) if (ids.includes(c.id)) c.status = removed ? 'removed' : 'candidate';
  }, { entityType: 'ai', entityId: genId, action: removed ? 'remove' : 'restore', summary: `${ids.length} generated suggestion(s) ${removed ? 'removed' : 'restored'}` });
}

// ----------------------------- Roles ------------------------------------------

export function mapRole(key: string, stakeholderId: string) {
  app().mutate((d) => {
    const r = d.roleSuggestions.find((x) => x.key === key);
    const st = d.stakeholders.find((x) => x.id === stakeholderId);
    if (!r || !st) return;
    r.status = 'mapped'; r.stakeholderId = stakeholderId; r.autoMatched = false;
    st.selected = true;
  }, { entityType: 'role', entityId: key, action: 'map', summary: `AI role mapped to existing stakeholder` });
}

const GROUP_FOR: Partial<Record<Archetype, string>> = {
  cxo_other: 'A', cxo_finance: 'A', cxo_hr: 'A', cxo_it: 'A', cxo_data: 'A', cxo_procurement: 'A', ceo: 'A', board: 'A', bu_head: 'A', country_head: 'A', sponsor: 'A', legal_risk_leader: 'A',
  gbs_head: 'B', gbs_leader: 'B', programme_lead: 'C', change_lead: 'C', function_head: 'C', process_owner: 'C',
  customer: 'G', supplier: 'G', partner: 'G', regulator: 'G', general_employee: 'H',
  retained_leader: 'E', retained_ops: 'E', service_recipient: 'E', governance_team: 'E',
};

export function addRolesAsStakeholders(keys: string[]) {
  app().mutate((d) => {
    for (const key of keys) {
      const r = d.roleSuggestions.find((x) => x.key === key);
      if (!r || r.status === 'mapped' || r.status === 'added') continue;
      const code = GROUP_FOR[r.archetype] ?? (STAKEHOLDER_LIBRARY.find((g) => g.members.some((m) => m.archetype === r.archetype))?.code ?? 'D');
      const gid = d.groups.find((g) => g.code === code)?.id ?? d.groups[0].id;
      const st: Stakeholder = {
        id: uid('st'), groupId: gid, roleName: r.role, archetype: r.archetype, libraryKey: null, isCustom: true, selected: true, entity: '', functionName: r.functionName,
        geography: '', waveIds: [], population: null, owner: '', influence: null, readiness: 'unknown',
        roles: { decisionMaker: ['cxo_other', 'cxo_finance', 'cxo_hr', 'cxo_it', 'cxo_data', 'cxo_procurement', 'ceo'].includes(r.archetype), approver: false, sponsor: false, communicator: false,
          executionOwner: ['function_head', 'process_owner', 'gbs_leader', 'gbs_head'].includes(r.archetype), recipient: true, support: false },
        responsibilities: r.description, dependencies: '', notes: `Added from AI role suggestion (${r.generationId ?? 'change pack'}). Confirm role, population and responsibilities.`, sortOrder: 900 + d.stakeholders.length,
      };
      d.stakeholders.push(st);
      r.status = 'added'; r.stakeholderId = st.id;
    }
  }, { entityType: 'role', entityId: 'bulk', action: 'add', summary: `${keys.length} AI-suggested role(s) added to the Stakeholder Register` });
}

export function setRoleStatus(key: string, status: RoleSuggestion['status']) {
  app().mutate((d) => { const r = d.roleSuggestions.find((x) => x.key === key); if (r) { r.status = status; if (status === 'proposed' || status === 'rejected') r.stakeholderId = null; } },
    { entityType: 'role', entityId: key, action: status, summary: `AI role ${status}` });
}

// ----------------------------- Change packs -----------------------------------

export function savePack(name: string, fn: string, templates: ChangeTemplate[]): { pack: ChangePack; skipped: string[] } {
  const s = cur();
  const existing = s.changePacks.find((p) => p.name.trim().toLowerCase() === name.trim().toLowerCase() && p.function === fn);
  const version = existing ? existing.version + 1 : 1;
  const packId = existing?.id ?? uid('pack');
  const skipped: string[] = [];
  const out: ChangeTemplate[] = [];
  templates.forEach((t) => {
    if (out.some((o) => similarity(o.title, t.title) >= 0.62)) { skipped.push(t.title); return; }
    out.push({ ...JSON.parse(JSON.stringify(t)), templateId: `PK-${packId.slice(-5).toUpperCase()}-${String(out.length + 1).padStart(3, '0')}`, templateVersion: version,
      provenance: { ...(t.provenance ?? { generationId: '', provider: '', model: '', generatedAt: nowIso(), requiresValidation: true }), packId, packVersion: version } });
  });
  const pack: ChangePack = { id: packId, name: name.trim(), function: fn, version, status: 'private', createdAt: existing?.createdAt ?? nowIso(), updatedAt: nowIso(), templates: out, publishedAt: null };
  app().mutate((d) => { d.changePacks = [...d.changePacks.filter((p) => p.id !== packId), pack]; }, { entityType: 'pack', entityId: packId, action: 'save', summary: `Change pack "${pack.name}" v${version} saved (${out.length} change(s), engagement-private)` });
  return { pack, skipped };
}

/** Explicit approval required in the UI: copies the pack into the shared library for use in other engagements. */
export async function publishPack(packId: string) {
  const p = cur().changePacks.find((x) => x.id === packId);
  if (!p) return 0;
  let n = 0;
  for (const t of p.templates) {
    const id = `PUB-${slug(p.function).toUpperCase().slice(0, 12)}-${packId.slice(-4).toUpperCase()}-${String(++n).padStart(3, '0')}`;
    await saveTemplateVersion({ ...t, templateId: id, templateVersion: 0, origin: 'custom' });
  }
  app().mutate((d) => { const x = d.changePacks.find((y) => y.id === packId); if (x) { x.status = 'published'; x.publishedAt = nowIso(); } },
    { entityType: 'pack', entityId: packId, action: 'publish', summary: `Change pack "${p.name}" v${p.version} published to the shared library (${n} template(s))` });
  return n;
}

export function deletePack(packId: string) {
  app().mutate((d) => { d.changePacks = d.changePacks.filter((p) => p.id !== packId); }, { entityType: 'pack', entityId: packId, action: 'delete', summary: 'Change pack deleted (selected changes keep their snapshots)' });
}

export type { AIDim };
