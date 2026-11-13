// TEST FIXTURE — hand-written replies in the generation schema for Sales Operations.
// Used to test how the pipeline interprets realistic content. Not live model output.
export const salesRoles = {
  schemaVersion: 'gbs-ci.change-generation.v1',
  functionInterpretation: 'Sales Operations: order management, CRM administration, pipeline reporting and sales support.',
  clarityWarning: null,
  roles: [
    { role: 'Chief Sales Officer', archetype: 'cxo_other', functionSpecific: true, description: 'Executive owner of the sales organisation' },
    { role: 'VP Sales Operations', archetype: 'function_head', functionSpecific: true, description: 'Leads sales operations' },
    { role: 'Regional Sales Head', archetype: 'retained_leader', functionSpecific: true, description: 'Leads regional sales teams' },
    { role: 'Sales Representatives', archetype: 'business_user', functionSpecific: true, description: 'Use CRM and request sales support' },
    { role: 'CRM Administrator', archetype: 'process_owner', functionSpecific: true, description: 'Configures and supports the CRM' },
    { role: 'Order Management Team', archetype: 'transferring', functionSpecific: true, description: 'Enters and maintains sales orders' },
    { role: 'GBS Sales Operations Lead', archetype: 'gbs_leader', functionSpecific: true, description: 'Leads sales operations delivery in GBS' },
    { role: 'Chief Data Officer', archetype: 'cxo_data', functionSpecific: false, description: 'Enterprise data governance' },
  ],
};

const rel = (role, relationship, reason) => ({ role, relationship, reason });
export const salesTE = {
  schemaVersion: 'gbs-ci.change-generation.v1',
  changes: [
    {
      temporaryId: 'TE-001', title: 'CRM workflow automation introduced for opportunity and quote approvals', primaryDimension: 'Change in Technology', function: 'Sales Operations',
      processArea: 'CRM / Opportunity Management', description: 'Opportunity, quote and discount approvals move from email to automated CRM workflows administered centrally.',
      typicalAsIs: 'Sales representatives route quotes and discount approvals by email and spreadsheets.', typicalToBe: 'Approvals are routed, tracked and escalated through CRM workflows configured by a central CRM team.',
      changeMechanisms: ['workflow_automation', 'tooling'],
      stakeholderRelationships: [
        rel('Sales Representatives', 'potential_direct_impact', 'Sales activities and CRM workflows change for quotes and approvals.'),
        rel('CRM Administrator', 'potential_direct_impact', 'Configuration and support responsibilities change.'),
        rel('VP Sales Operations', 'potential_indirect_impact', 'Operational oversight of approvals changes depending on ownership.'),
        rel('Chief Sales Officer', 'governance_relevance', 'Sponsorship of discount policy and approval thresholds.'),
        rel('Chief Data Officer', 'requires_review', 'Only if data governance, ownership or reporting responsibilities are affected.'),
      ],
      possibleMilestones: ['Technology requirements finalisation', 'Employee training', 'Wave-specific go-live'], communicationObjectives: ['training', 'awareness'],
      assumptions: ['The CRM platform supports configurable approval workflows.'], requiresValidation: true,
    },
  ],
};
export const salesOM = {
  schemaVersion: 'gbs-ci.change-generation.v1',
  changes: [
    {
      temporaryId: 'OM-001', title: 'Ownership of sales order processing transfers from regional teams to GBS', primaryDimension: 'Change in Operating Model', function: 'Sales Operations',
      processArea: 'Order Management', description: 'Order entry, order changes and order-to-invoice hand-offs move from regional sales support teams to the GBS.',
      typicalAsIs: 'Regional sales support teams enter and amend orders locally.', typicalToBe: 'GBS order management enters and amends orders to a common standard and SLA.',
      changeMechanisms: ['service_ownership', 'operating_responsibilities'],
      stakeholderRelationships: [
        rel('Order Management Team', 'potential_direct_impact', 'Their order processing activities move into GBS.'),
        rel('GBS Sales Operations Lead', 'potential_direct_impact', 'GBS assumes delivery responsibility and SLA accountability.'),
        rel('VP Sales Operations', 'potential_direct_impact', 'Service delivery accountability changes.'),
        rel('Regional Sales Head', 'potential_indirect_impact', 'Regional teams receive order support from GBS.'),
        rel('Sales Representatives', 'communication_relevance', 'They need to know the new order support contacts.'),
        rel('Chief Sales Officer', 'governance_relevance', 'Executive sponsorship of the service transfer.'),
      ],
      possibleMilestones: ['Future operating model development', 'Transition kickoff announcement', 'Wave-specific go-live'], communicationObjectives: ['alignment', 'awareness'],
      assumptions: ['Order management is included in the GBS scope.'], requiresValidation: true,
    },
  ],
};
export function salesRespond(user) {
  if (user.includes('TASK: ROLES_REQUEST')) return JSON.stringify(salesRoles);
  if (user.includes('DIMENSION_REQUEST TE')) return JSON.stringify(salesTE);
  if (user.includes('DIMENSION_REQUEST OM')) return JSON.stringify(salesOM);
  return JSON.stringify({ schemaVersion: 'gbs-ci.change-generation.v1', changes: [] });
}
