// Suggestions for consultant-authored (custom) changes, based on keyword rules.
import type { ChangeRecord, EngagementState } from '../../domain/types';
import { assessPair, changeFeatures } from '../../engine/impact';

export function changeSuggestions(s: EngagementState, c: ChangeRecord) {
  const dim = s.dimensions.find((d) => d.id === c.dimensionId);
  const ft = changeFeatures(c);
  const gaps: string[] = [];
  if (!c.asIs.trim()) gaps.push('As-Is state not documented');
  if (!c.toBe.trim()) gaps.push('To-Be state not documented');
  if (!c.rationale.trim()) gaps.push('Business rationale missing (artifacts will show a placeholder)');
  if (!c.functionTags.length && !c.functionName) gaps.push('Function not specified — treated as cross-functional');
  if (!c.effectiveDate) gaps.push('Expected effective date missing');
  if (!c.owner) gaps.push('Change owner not named');
  const impacted: { name: string; directness: string; selected: boolean }[] = [];
  if (dim?.isDefault) {
    for (const st of s.stakeholders) {
      const r = assessPair(st, c, dim.code);
      if (r.hit === 'direct' || r.hit === 'indirect') impacted.push({ name: st.roleName, directness: r.hit, selected: st.selected });
    }
  }
  const relDims: string[] = [];
  if (ft.transfer || ft.reporting) relDims.push('Organization Structure');
  if (ft.system) relDims.push('Technology');
  if (ft.helpdesk) relDims.push('Interaction Model');
  return { gaps, impacted, relDims };
}
