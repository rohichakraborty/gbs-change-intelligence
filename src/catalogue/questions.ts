// Shared clarification questions. Questions are reused across templates so one
// answer can be applied in bulk to every selected change that asks it.
import type { ClarificationQuestion } from './types';

const q = (id: string, text: string, help: string, impactCritical: boolean, options: [string, string, string][]): ClarificationQuestion =>
  ({ id, text, help, impactCritical, options: options.map(([oid, label, effect]) => ({ id: oid, label, effect })) });

export const QUESTIONS: Record<string, ClarificationQuestion> = {
  tech_type: q('tech_type', 'What type of technology change is taking place?', 'Determines whether end users, processes, data, and support teams are affected.', true, [
    ['replace', 'New platform replacing an existing system', 'End-user training, process changes, data migration, support and access changes.'],
    ['supplement', 'New platform supplementing existing systems', 'Training and access for users of the new capability; existing processes largely unchanged.'],
    ['consolidate', 'Consolidation of multiple platforms', 'Process harmonisation, data migration, retraining of users of the retired systems.'],
    ['upgrade', 'Upgrade of an existing platform', 'Mostly minor user changes; regression testing and support readiness.'],
    ['ownership', 'Change in application ownership only', 'Support ownership, governance, escalation, and service accountability — no end-user change.'],
  ]),
  employment_effect: q('employment_effect', 'How are affected employees moving?', 'Determines whether HR, Payroll, and Legal handling is required and how sensitive communications are.', true, [
    ['transfer', 'Transfer of employment to the GBS entity', 'Employment terms, payroll, legal consultation per jurisdiction; HR-led communications.'],
    ['secondment', 'Secondment / dotted-line reporting to GBS', 'Reporting-line and management changes; employment stays with the current entity.'],
    ['role_change', 'Same employer, role content changes only', 'Role redesign and training; no transfer of employment.'],
    ['new_hires', 'Work moves to newly hired GBS staff (no transfers)', 'Recruitment and knowledge transfer; current employees face role or redeployment decisions.'],
  ]),
  data_scope: q('data_scope', 'Are data responsibilities or data governance in scope of this change?', 'Decides whether the CDO and data owners are affected, or only IT delivery roles.', true, [
    ['yes', 'Yes — data ownership, stewardship, or data governance changes', 'CDO and data governance roles have a potential accountability impact.'],
    ['no', 'No — IT service delivery only', 'CDO and data owners are not affected by this change.'],
  ]),
  requester_impact: q('requester_impact', 'Do business users change how they request, approve, or submit?', 'Decides whether business users are directly impacted by the process change.', true, [
    ['yes', 'Yes — requesters or approvers follow new steps', 'Business users are directly impacted and need guidance or training.'],
    ['no', 'No — change is internal to the delivery team', 'Business users are not directly impacted.'],
  ]),
  supplier_facing: q('supplier_facing', 'Does the change alter how suppliers interact with the organisation?', 'Decides whether suppliers need formal notification.', true, [
    ['yes', 'Yes — supplier contact points, submission, or payment queries change', 'Suppliers are impacted (interaction model) and need an approved notification.'],
    ['no', 'No — suppliers see no difference', 'Suppliers are not affected.'],
  ]),
  customer_facing: q('customer_facing', 'Does the change alter how customers interact with the organisation?', 'Decides whether customers need formal notification.', true, [
    ['yes', 'Yes — customer contact points or billing interactions change', 'Customers are impacted and need approved communication.'],
    ['no', 'No — customers see no difference', 'Customers are not affected.'],
  ]),
  automation_effect: q('automation_effect', 'What does the automation do to existing roles?', 'Determines whether role content and workforce plans change.', true, [
    ['augment', 'Assists people — tasks become faster, roles unchanged', 'Users need training; no role or workforce change.'],
    ['replace_tasks', 'Removes tasks — role content or capacity reduces', 'Role redesign or redeployment; HR involvement and sensitive handling.'],
  ]),
  portal_population: q('portal_population', 'Who uses the new self-service channel?', 'Determines the size and type of the impacted population.', false, [
    ['all_employees', 'All employees', 'Enterprise-wide awareness and guidance required.'],
    ['managers', 'Managers / approvers only', 'Line managers are impacted; employees are not directly affected.'],
    ['function_users', 'Users within the affected function only', 'Impact limited to the in-scope function.'],
  ]),
  data_owner_model: q('data_owner_model', 'Do data owner roles change under the new model?', 'Distinguishes direct from indirect impact on data owners.', true, [
    ['owners_change', 'Yes — data owner accountabilities are reassigned', 'Data owners are directly impacted.'],
    ['owners_unchanged', 'No — only stewardship or operations move', 'Data owners are indirectly impacted (new counterparts).'],
  ]),
  relocation: q('relocation', 'Does the change require people or work to relocate?', 'Determines Facilities and workplace impacts.', false, [
    ['yes', 'Yes — sites, seating, or work locations change', 'Facilities and affected employees are impacted.'],
    ['no', 'No location change', 'No facilities impact.'],
  ]),
};
