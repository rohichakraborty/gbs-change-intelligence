// Change Identification actions: template selection, bulk scope edits,
// clarifications, change-level impact decisions, import, and library maintenance.
// Every operation goes through mutate() — persisted, audited, and undoable.
import type { ChangeLevelDecision, ChangeRecord, EngagementState, ImportRow, PropagationSummary } from '../domain/types';
import { customChange, nextChangeCode } from '../domain/factory';
import { nowIso, uid } from '../domain/util';
import { derive } from '../engine/derive';
import { classOfHit } from '../engine/impact';
import { instanceFromTemplate, matchTemplates } from '../catalogue/instance';
import { getCatalogueOverlay, getLatestTemplate, getTemplate, latestVersionNumber, setCatalogueOverlay } from '../catalogue/registry';
import { ensureRoleSuggestions } from './roleRegister';
import type { ChangeTemplate } from '../catalogue/types';
import { useApp } from './store';

const app = () => useApp.getState();
const cur = () => app().current!;

/** A selectable template: shared library, this engagement's AI candidates, or its private change packs. */
export function resolveSelectable(s: EngagementState, id: string): ChangeTemplate | undefined {
  const lib = getLatestTemplate(id);
  if (lib) return lib;
  for (const g of s.aiGenerations ?? []) { const c = g.candidates.find((x) => x.id === id); if (c) return c.template; }
  for (const p of s.changePacks ?? []) { const t = p.templates.find((x) => x.templateId === id); if (t) return t; }
  return undefined;
}

// ----------------------------- Propagation summary ---------------------------

/** Compare derived outputs before/after a change-selection edit and record what moved downstream. */
function recordPropagation(before: EngagementState, action: string, changesAffected: number) {
  const after = cur();
  if (after === before) return;
  const d0 = derive(before), d1 = derive(after);
  let changed = 0, newImpacts = 0;
  for (const [k, e1] of d1.impacts) {
    const e0 = d0.impacts.get(k);
    if (!e0 || e0.classification !== e1.classification || e0.directness !== e1.directness) changed++;
    if (e1.classification === 'impacted' && e0?.classification !== 'impacted') newImpacts++;
  }
  const keys0 = new Set(d0.suggestions.map((x) => x.key));
  const summary: PropagationSummary = {
    at: nowIso(), action, changesAffected, impactCellsChanged: changed, newImpactRecommendations: newImpacts,
    newAudienceSuggestions: d1.suggestions.filter((x) => !keys0.has(x.key)).length,
    communicationsFlagged: d1.activeComms.filter((c) => c.upstreamChanged).length - d0.activeComms.filter((c) => c.upstreamChanged).length
      + d1.suggestions.filter((x) => x.kind === 'remove' && !keys0.has(x.key)).length,
    milestonesSuggested: d1.suggestedMilestones.size,
    artifactsOutdated: [...d1.artifactStates.values()].filter((x) => x.outdated).length,
  };
  app().patchCurrent((d) => { d.lastPropagation = summary; });
}

function withPropagation(action: string, n: number, fn: () => void) {
  const before = cur();
  fn();
  recordPropagation(before, action, n);
}

// ----------------------------- Selection --------------------------------------

/** Select or deselect library templates. Never creates duplicates; deselection keeps the record (inactive). */
export function setTemplatesSelected(templateIds: string[], on: boolean): { added: number; reactivated: number; removed: number } {
  const res = { added: 0, reactivated: 0, removed: 0 };
  const s = cur();
  const work = templateIds.filter((id) => {
    const existing = s.changes.filter((c) => c.templateId === id);
    if (on) return !existing.some((c) => c.active);
    return existing.some((c) => c.active);
  });
  if (!work.length) return res;
  withPropagation(on ? `Selected ${work.length} library change(s)` : `Deselected ${work.length} library change(s)`, work.length, () => {
    app().mutate((d) => {
      for (const id of work) {
        const existing = d.changes.find((c) => c.templateId === id);
        if (on) {
          if (existing) { existing.active = true; existing.lastModifiedAt = nowIso(); res.reactivated++; continue; }
          const t = resolveSelectable(d as EngagementState, id);
          if (!t) continue;
          if (t.origin !== 'builtin' || t.templateVersion > 1) d.templateSnapshots[`${t.templateId}@${t.templateVersion}`] = JSON.parse(JSON.stringify(t));
          if (t.aiRoles?.length) ensureRoleSuggestions(d as EngagementState, t.aiRoles, t.functionTags.find((f) => f !== 'Enterprise') ?? '', t.provenance?.generationId ?? null);
          d.changes.push(instanceFromTemplate(d as EngagementState, t, nextChangeCode(d as EngagementState)));
          res.added++;
        } else {
          for (const c of d.changes.filter((x) => x.templateId === id && x.active)) { c.active = false; c.lastModifiedAt = nowIso(); res.removed++; }
        }
      }
    }, { entityType: 'change', entityId: 'selection', action: on ? 'select' : 'deselect', summary: `${on ? 'Selected' : 'Deselected'}: ${work.join(', ')}` });
  });
  return res;
}

export function setChangesActive(ids: string[], active: boolean) {
  withPropagation(active ? `Restored ${ids.length} change(s)` : `Removed ${ids.length} change(s) from scope`, ids.length, () => {
    app().mutate((d) => { for (const c of d.changes) if (ids.includes(c.id)) { c.active = active; c.lastModifiedAt = nowIso(); } },
      { entityType: 'change', entityId: 'bulk', action: active ? 'restore' : 'remove', summary: `${ids.length} change(s) ${active ? 'restored' : 'removed from scope (kept for traceability)'}` });
  });
}

/** Bulk edit of change records (scope, waves, status, dates…). Records which fields were overridden. */
export function updateChanges(ids: string[], patch: Partial<ChangeRecord>, summary: string) {
  withPropagation(summary, ids.length, () => {
    app().mutate((d) => {
      for (const c of d.changes) {
        if (!ids.includes(c.id)) continue;
        Object.assign(c, patch);
        c.lastModifiedAt = nowIso();
        const fields = Object.keys(patch).filter((k) => !['status', 'lastModifiedAt', 'active'].includes(k));
        c.scopeOverrides = Array.from(new Set([...(c.scopeOverrides ?? []), ...fields]));
        if (['description', 'asIs', 'toBe', 'customDescription'].some((k) => k in patch)) c.defaultsReviewed = true;
      }
    }, { entityType: 'change', entityId: ids.length === 1 ? ids[0] : 'bulk', action: 'update', summary });
  });
}

export function setClarification(changeIds: string[], questionId: string, optionId: string) {
  withPropagation(`Clarification "${questionId}" answered for ${changeIds.length} change(s)`, changeIds.length, () => {
    app().mutate((d) => {
      for (const c of d.changes) if (changeIds.includes(c.id)) { c.clarificationAnswers = { ...(c.clarificationAnswers ?? {}), [questionId]: optionId }; c.lastModifiedAt = nowIso(); }
    }, { entityType: 'change', entityId: changeIds.length === 1 ? changeIds[0] : 'bulk', action: 'clarify', summary: `${questionId} → ${optionId} (${changeIds.length} change(s))` });
  });
}

export function clearClarification(changeIds: string[], questionId: string) {
  withPropagation(`Clarification "${questionId}" cleared`, changeIds.length, () => {
    app().mutate((d) => { for (const c of d.changes) if (changeIds.includes(c.id) && c.clarificationAnswers) delete c.clarificationAnswers[questionId]; },
      { entityType: 'change', entityId: 'bulk', action: 'clarify', summary: `${questionId} cleared` });
  });
}

export function addCustomChange(dimensionId: string): string {
  let id = '';
  app().mutate((d) => { const c = customChange(d as EngagementState, dimensionId); id = c.id; d.changes.push(c); }, { entityType: 'change', entityId: 'new', action: 'add', summary: 'Custom change created' });
  return id;
}

export function duplicateChange(id: string): string {
  let nid = '';
  app().mutate((d) => {
    const c = d.changes.find((x) => x.id === id);
    if (!c) return;
    const copy = { ...JSON.parse(JSON.stringify(c)), id: uid('chg'), code: nextChangeCode(d as EngagementState), title: `${c.title} (copy)`, status: 'draft', source: 'custom',
      templateId: null, templateVersion: null, defaultsReviewed: true, selectedAt: nowIso(), lastModifiedAt: nowIso(),
      evidence: c.templateId ? `${c.evidence} Duplicated from ${c.code}; converted to a custom change so it is not counted as a second template selection.`.trim() : c.evidence } as ChangeRecord;
    // A duplicate of a template change keeps the template's rule-based meaning only if it stays template-linked; we keep it custom to avoid double-counting.
    nid = copy.id;
    d.changes.push(copy);
  }, { entityType: 'change', entityId: id, action: 'duplicate', summary: 'Change duplicated' });
  return nid;
}

export function upgradeTemplateVersion(changeIds: string[]) {
  withPropagation(`Updated ${changeIds.length} change(s) to the latest library version`, changeIds.length, () => {
    app().mutate((d) => {
      for (const c of d.changes) {
        if (!changeIds.includes(c.id) || !c.templateId) continue;
        const t = getLatestTemplate(c.templateId);
        if (!t) continue;
        if (t.origin === 'custom' || t.templateVersion > 1) d.templateSnapshots[`${t.templateId}@${t.templateVersion}`] = JSON.parse(JSON.stringify(t));
        c.templateVersion = t.templateVersion;
        if (!c.scopeOverrides.includes('title')) c.title = t.title;
        if (!c.defaultsReviewed) { c.description = t.description; c.asIs = t.typicalAsIs; c.toBe = t.typicalToBe; }
        c.lastModifiedAt = nowIso();
      }
    }, { entityType: 'change', entityId: 'bulk', action: 'template-upgrade', summary: `${changeIds.length} change(s) moved to latest template version` });
  });
}

// ----------------------------- Change-level impact decisions ------------------

export function setChangeDecision(stakeholderId: string, changeId: string, dimensionId: string, decision: Omit<ChangeLevelDecision, 'decidedAt' | 'basedOnRec'> | null) {
  const s = cur();
  const rec = derive(s).impactRecs.get(`${stakeholderId}|${dimensionId}`);
  const pair = rec?.pairs.find((p) => p.changeId === changeId);
  const key = `${stakeholderId}|${changeId}|${dimensionId}`;
  app().mutate((d) => {
    if (!decision) delete d.changeAssessments[key];
    else d.changeAssessments[key] = { ...decision, decidedAt: nowIso(), basedOnRec: pair ? classOfHit(pair.hit) : null };
  }, { entityType: 'impact', entityId: key, action: decision ? 'change-decision' : 'change-decision-cleared', summary: `Change-level decision ${decision ? `→ ${decision.classification}` : 'cleared'} (${s.changes.find((c) => c.id === changeId)?.code})` });
}

// ----------------------------- Import -----------------------------------------

export function queueImport(rows: { title: string; description: string; fn: string; dimension: string }[]) {
  const queued: ImportRow[] = rows.filter((r) => r.title.trim()).map((r) => {
    const best = matchTemplates(`${r.title} ${r.description}`, r.fn)[0];
    return { id: uid('imp'), rawTitle: r.title.trim(), rawDescription: r.description.trim(), rawFunction: r.fn.trim(), rawDimension: r.dimension.trim(),
      matchTemplateId: best && best.score >= 0.18 ? best.template.templateId : null, matchScore: best ? Math.round(best.score * 100) / 100 : 0, status: 'pending', resultChangeId: null };
  });
  app().mutate((d) => { d.importQueue.push(...queued); }, { entityType: 'import', entityId: 'batch', action: 'import', summary: `${queued.length} change row(s) imported for review` });
  return queued.length;
}

export function resolveImport(rowId: string, how: 'accept' | 'custom' | 'dismiss', templateId?: string) {
  const s = cur();
  const row = s.importQueue.find((r) => r.id === rowId);
  if (!row) return;
  const before = s;
  app().mutate((d) => {
    const r = d.importQueue.find((x) => x.id === rowId)!;
    if (how === 'dismiss') { r.status = 'dismissed'; return; }
    if (how === 'accept') {
      const tid = templateId ?? r.matchTemplateId;
      const t = tid ? getLatestTemplate(tid) : undefined;
      if (!t) return;
      const existing = d.changes.find((c) => c.templateId === t.templateId);
      if (existing) { existing.active = true; existing.customDescription = existing.customDescription || r.rawDescription; r.resultChangeId = existing.id; }
      else {
        const c = instanceFromTemplate(d as EngagementState, t, nextChangeCode(d as EngagementState));
        c.customDescription = r.rawDescription;
        c.evidence = `${c.evidence} Matched from imported row "${r.rawTitle}".`;
        d.changes.push(c);
        r.resultChangeId = c.id;
      }
      r.matchTemplateId = t.templateId;
      r.status = 'accepted';
      return;
    }
    const dimId = /process/i.test(r.rawDimension) ? 'dim_pr' : /org|structure/i.test(r.rawDimension) ? 'dim_os' : /tech/i.test(r.rawDimension) ? 'dim_te' : /interact/i.test(r.rawDimension) ? 'dim_im' : 'dim_om';
    const c = customChange(d as EngagementState, dimId);
    Object.assign(c, { title: r.rawTitle, description: r.rawDescription, evidence: `Imported change list row "${r.rawTitle}".` });
    const fnMatch = d.engagement.functions.find((f) => r.rawFunction && f.name.toLowerCase().includes(r.rawFunction.toLowerCase().slice(0, 4)));
    if (fnMatch) { c.functionName = fnMatch.name; c.functionTags = [fnMatch.name]; }
    d.changes.push(c);
    r.resultChangeId = c.id;
    r.status = 'custom';
  }, { entityType: 'import', entityId: rowId, action: how, summary: `Imported row "${row.rawTitle}" → ${how}` });
  recordPropagation(before, `Import row ${how}`, 1);
}

// ----------------------------- Library maintenance ----------------------------

async function persistOverlay() {
  const p = app().persistence;
  if (p) await p.saveCatalogue(getCatalogueOverlay()).catch(() => app().toast('Library change could not be saved.', 'error'));
  app().bumpCatalogue();
}

/** Save an edited or new template as a new version. Engagement selections keep their own version. */
export async function saveTemplateVersion(t: ChangeTemplate) {
  const o = getCatalogueOverlay();
  const v = Math.max(latestVersionNumber(t.templateId), 0) + 1;
  const next: ChangeTemplate = { ...JSON.parse(JSON.stringify(t)), templateVersion: v, origin: getTemplate(t.templateId, 1) && getTemplate(t.templateId, 1)!.origin === 'builtin' ? 'builtin' : 'custom' };
  next.rules = next.rules.map((r, i) => ({ ...r, id: r.id || `${t.templateId}.R${i + 1}` }));
  next.ruleIds = next.rules.map((r) => r.id);
  setCatalogueOverlay({ ...o, versions: [...o.versions, next], updatedAt: nowIso() });
  await persistOverlay();
  return v;
}

export async function setTemplateDeprecated(id: string, deprecated: boolean) {
  const o = getCatalogueOverlay();
  setCatalogueOverlay({ ...o, deprecated: { ...o.deprecated, [id]: deprecated }, updatedAt: nowIso() });
  await persistOverlay();
}
