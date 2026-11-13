// TEST DOUBLE — not a model. Produces structurally valid replies from the prompt
// text so the pipeline (validation, retries, de-duplication, register, impact,
// downstream) can be tested without a live LLM. Never bundled into the app.
//
// Failure switches (in the function name): "Malformed" → first reply per request is
// prose (tests repair retry); "Garbage" → always prose; "Upstream" → throws.

const seen = new Map();

function fnName(user) { return /"selectedFunction":\s*"([^"]+)"/.exec(user)?.[1] ?? 'Function'; }
function rolesFrom(user) { return [...user.matchAll(/^- (.+?) \[[a-z_]+\]$/gm)].map((m) => m[1]); }
function avoidFrom(user) {
  const block = /DO NOT DUPLICATE[^\n]*\n([\s\S]*?)\n\nInstructions:/.exec(user)?.[1] ?? '';
  return block.split('\n').map((l) => l.replace(/^- /, '').trim().toLowerCase()).filter(Boolean);
}

const DIM_NAMES = { OM: 'Change in Operating Model', PR: 'Change in Process', OS: 'Change in Organization Structure', TE: 'Change in Technology', IM: 'Change in Interaction Model' };
const PATTERNS = {
  OM: [['Ownership of {F} transaction processing transfers to GBS', 'Transaction Processing'], ['{F} reporting production becomes centrally managed in GBS', 'Reporting'], ['Service levels are introduced for {F} services delivered by GBS', 'Service Management'], ['Decision rights for {F} policy move to a central governance forum', 'Governance']],
  PR: [['{F} request intake process is standardised', 'Request Intake'], ['{F} approval workflow is redesigned with standard thresholds', 'Approvals'], ['{F} exceptions follow a standard escalation process', 'Exception Handling'], ['{F} month-end activities follow a common calendar', 'Period Close']],
  OS: [['{F} team members transfer to the GBS organisation', 'Workforce'], ['New GBS {F} team leader roles are created', 'Team Structure'], ['Retained {F} roles are refocused on business partnering', 'Retained Organisation']],
  TE: [['{F} workflow automation is introduced', 'Workflow'], ['{F} reporting moves to a central analytics platform', 'Analytics'], ['Access roles for {F} systems are revised', 'Access Management']],
  IM: [['Business users raise {F} requests through a GBS service desk', 'Service Desk'], ['Service reviews between GBS and {F} leadership are introduced', 'Service Reviews'], ['{F} stakeholders use a new self-service portal', 'Self-Service']],
};

export function respond(system, user) {
  const F = fnName(user);
  const purpose = user.includes('TASK: ROLES_REQUEST') ? 'roles' : (/TASK: DIMENSION_REQUEST (\w\w)/.exec(user)?.[1] ?? 'unknown');
  if (/Upstream/.test(F)) throw Object.assign(new Error('synthetic upstream failure'), { status: 500 });
  const key = `${F}|${purpose}|${user.includes('YOUR PREVIOUS REPLY') ? 'repair' : 'first'}`;
  seen.set(key, (seen.get(key) ?? 0) + 1);
  if (/Garbage/.test(F)) return 'I am sorry, I cannot produce that list right now.';
  if (/Malformed/.test(F) && !user.includes('YOUR PREVIOUS REPLY')) return 'Here are some ideas: improve things and make them better.';

  if (purpose === 'roles') {
    const unclear = F.length <= 3 || /^x+$/i.test(F);
    return JSON.stringify({
      schemaVersion: 'gbs-ci.change-generation.v1',
      functionInterpretation: unclear ? `Interpreted "${F}" as an operations support function.` : `${F} as a business function in scope for GBS.`,
      clarityWarning: unclear ? `"${F}" is ambiguous; confirm what the function covers.` : null,
      roles: [
        { role: `Chief ${F} Officer`, archetype: 'cxo_other', functionSpecific: true, description: `Executive owner of ${F}` },
        { role: `Head of ${F}`, archetype: 'function_head', functionSpecific: true, description: `Leads ${F}` },
        { role: `${F} Manager`, archetype: 'team_lead', functionSpecific: true, description: 'Day-to-day team management' },
        { role: `${F} Team Members`, archetype: 'transferring', functionSpecific: true, description: 'Perform the activities in scope' },
        { role: `${F} Systems Administrator`, archetype: 'process_owner', functionSpecific: true, description: 'Configures and supports the function\'s tools' },
        { role: 'GBS Head', archetype: 'gbs_head', functionSpecific: false, description: 'Receiving GBS leadership' },
        { role: `Business Users of ${F}`, archetype: 'business_user', functionSpecific: false, description: 'Request and consume the services' },
        { role: 'Chief Data Officer', archetype: 'cxo_data', functionSpecific: false, description: 'Enterprise data governance' },
        { role: 'not a role', archetype: 'not_an_archetype' }, // invalid on purpose (archetype falls back; description missing is allowed)
      ],
    });
  }
  const dim = purpose;
  const roles = rolesFrom(user);
  const avoid = avoidFrom(user);
  const R = (i) => roles[i % roles.length] ?? 'Business Users';
  const more = user.includes('Add up to 8 further');
  const base = (PATTERNS[dim] ?? []).map(([t, p]) => [t.replaceAll('{F}', F), p]);
  const list = more ? [[`Additional ${F} ${dim} change: knowledge base of ${F} procedures is introduced`, 'Knowledge'], [`Additional ${F} ${dim} change: ${F} quality checks are sampled centrally`, 'Quality']] : base;
  const changes = list.filter(([t]) => !avoid.includes(t.toLowerCase())).map(([title, area], i) => ({
    temporaryId: `${dim}-${String(i + 1).padStart(3, '0')}`, title, primaryDimension: DIM_NAMES[dim], function: F, processArea: area,
    description: `${title}. This is a preliminary scenario for ${F} in the GBS transition.`,
    typicalAsIs: `${area} activities for ${F} are performed by local teams in different ways.`,
    typicalToBe: `${area} activities for ${F} follow one GBS standard with defined owners.`,
    changeMechanisms: [dim === 'TE' ? 'technology' : dim === 'OS' ? 'reporting_lines' : 'service_ownership'],
    stakeholderRelationships: [
      { role: R(3), relationship: 'potential_direct_impact', reason: 'Their day-to-day activities change.' },
      { role: R(1), relationship: 'potential_direct_impact', reason: 'Accountability for the activity changes.' },
      { role: R(5), relationship: 'potential_direct_impact', reason: 'GBS takes on delivery responsibility.' },
      { role: R(0), relationship: 'governance_relevance', reason: 'Executive oversight and sponsorship required.' },
      { role: R(6), relationship: dim === 'IM' ? 'potential_direct_impact' : 'communication_relevance', reason: 'They request and receive the service.' },
      ...(dim === 'TE' ? [{ role: R(7), relationship: 'requires_review', reason: 'Only if data governance or reporting ownership changes.' }, { role: R(4), relationship: 'potential_direct_impact', reason: 'Configuration and support responsibilities change.' }] : []),
    ],
    possibleMilestones: dim === 'OS' ? ['Employee transfer planning', 'Communication to impacted personnel'] : ['Future operating model development', 'Wave-specific go-live'],
    communicationObjectives: dim === 'TE' ? ['training', 'inform'] : ['alignment', 'awareness'],
    assumptions: [`${F} activities of this type are in GBS scope.`],
    requiresValidation: true,
  }));
  if (!more && changes.length) {
    changes.push({ ...changes[0], temporaryId: 'DUP' }); // exact duplicate → must be removed
    if (dim === 'OM') changes.push({ title: `${F} broken record`, primaryDimension: DIM_NAMES[dim], processArea: 'X' }); // invalid → rejected
  }
  return '```json\n' + JSON.stringify({ schemaVersion: 'gbs-ci.change-generation.v1', changes }) + '\n```';
}

export function calls() { return seen; }
