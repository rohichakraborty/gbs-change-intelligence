// ---------------------------------------------------------------------------
// GBS Change Intelligence — canonical domain model (single source of truth).
// Every matrix, plan, and artifact in the app is derived from these records.
// ---------------------------------------------------------------------------

export type ID = string;
export type ISODate = string; // yyyy-mm-dd
export type TimeUnit = 'days' | 'weeks' | 'months';

/** Where a value came from — drives the visual language across the app. */
export type Provenance = 'fact' | 'rule' | 'ai' | 'consultant' | 'missing';

export interface Comment {
  id: ID;
  text: string;
  at: string;
}

// ----------------------------- Engagement ---------------------------------

export interface FunctionScope {
  id: ID;
  name: string;
  approach: string; // e.g. Lift-and-shift, Lift-and-transform
}

export interface Wave {
  id: ID;
  name: string;
  goLiveDate: ISODate | null;
  scope: string;
  functions: string[];
  geographies: string[];
}

export interface GovernanceRole {
  id: ID;
  title: string;
  personName: string;
  /** Links the governance seat to a communicator role used by the engine. */
  communicatorRoleId: ID | null;
}

export interface ScoringSettings {
  weights: { responsibilities: number; relationships: number; tools: number; behaviours: number };
  thresholds: { medium: number; high: number }; // weighted average cut-offs (0–3 scale)
}

export interface Engagement {
  id: ID;
  name: string;
  client: string;
  industry: string;
  isDemo: boolean;
  description: string;
  entities: string[];
  geographies: string[];
  gbsLocations: string[];
  primaryLanguage: string;
  additionalLanguages: string[];
  transformationTypes: string[];
  customType: string;
  functions: FunctionScope[];
  startDate: ISODate | null;
  plannedGoLive: ISODate | null;
  timeUnit: TimeUnit;
  currentPhaseId: ID | null;
  originOrg: string;
  destinationOrg: string;
  governance: GovernanceRole[];
  confidentiality: string;
  selectedDimensionIds: ID[];
  primaryWaveId: ID | null;
  setupComplete: boolean;
  settings: ScoringSettings;
  createdAt: string;
  updatedAt: string;
}

// ----------------------------- Change ------------------------------------

export interface ChangeDimension {
  id: ID;
  code: string;
  label: string;
  short: string;
  description: string;
  isDefault: boolean;
}

export type RecordStatus = 'draft' | 'needs_review' | 'confirmed';

export interface ChangeRecord {
  id: ID;
  code: string; // CHG-001
  dimensionId: ID;
  title: string;
  description: string;
  asIs: string;
  toBe: string;
  notChanging: string;
  rationale: string;
  functionName: string;
  geography: string;
  process: string;
  effectiveDate: ISODate | null;
  milestoneId: ID | null;
  waveIds: ID[];
  peopleAffected: number | null;
  owner: string;
  operationalImpact: string;
  behaviouralImpact: string;
  dependencies: string;
  assumptions: string;
  evidence: string;
  status: RecordStatus;
  // ---- Template-derived instance fields (schema v2). Custom changes have source 'custom'. ----
  source: 'template' | 'custom';
  templateId: string | null;
  templateVersion: number | null;
  /** false = deselected / removed from scope; kept for traceability and re-selection. */
  active: boolean;
  /** Applicable functions ([] = all in-scope functions / cross-functional). functionName stays the primary one. */
  functionTags: string[];
  processTags: string[];
  entities: string[];
  /** Clarification answers: questionId -> optionId, or 'skip' when the consultant chose to skip. */
  clarificationAnswers: Record<string, string>;
  /** Fields the consultant changed from the template default. */
  scopeOverrides: string[];
  customDescription: string;
  /** True once the consultant has reviewed the library-default description / As-Is / To-Be for this engagement. */
  defaultsReviewed: boolean;
  selectedAt: string | null;
  lastModifiedAt: string | null;
}

// ----------------------------- Stakeholders ------------------------------

export type Archetype =
  | 'board' | 'ceo' | 'cxo_finance' | 'cxo_hr' | 'cxo_it' | 'cxo_other' | 'bu_head' | 'country_head'
  | 'sponsor' | 'legal_risk_leader'
  | 'gbs_head' | 'gbs_leader'
  | 'programme_lead' | 'change_lead' | 'function_head' | 'process_owner'
  | 'transferring' | 'retained_modified' | 'redeployed' | 'retained_unchanged' | 'new_hire'
  | 'sme' | 'team_lead' | 'business_user' | 'hypercare_team'
  | 'retained_leader' | 'retained_ops' | 'service_recipient' | 'governance_team'
  | 'hr_support' | 'lnd' | 'internal_comms' | 'it_support' | 'infosec' | 'legal' | 'procurement'
  | 'finance_support' | 'payroll' | 'facilities' | 'compliance'
  | 'supplier' | 'customer' | 'partner' | 'regulator'
  | 'general_employee'
  | 'cxo_data' | 'cxo_procurement' | 'data_governance';

export interface StakeholderRoleFlags {
  decisionMaker: boolean;
  approver: boolean;
  sponsor: boolean;
  communicator: boolean;
  executionOwner: boolean;
  recipient: boolean;
  support: boolean;
}

export interface StakeholderGroup {
  id: ID;
  code: string;
  name: string;
  sortOrder: number;
}

export type Readiness = 'unknown' | 'resistant' | 'concerned' | 'aware' | 'supportive' | 'champion';
export type Level3 = 'low' | 'medium' | 'high';

export interface Stakeholder {
  id: ID;
  groupId: ID;
  roleName: string;
  archetype: Archetype;
  libraryKey: string | null;
  isCustom: boolean;
  selected: boolean;
  entity: string;
  functionName: string; // '' = cross-functional
  geography: string;
  waveIds: ID[]; // [] = all waves
  population: number | null;
  owner: string;
  influence: Level3 | null;
  readiness: Readiness;
  roles: StakeholderRoleFlags;
  responsibilities: string;
  dependencies: string;
  notes: string;
  sortOrder: number;
}

// ----------------------------- Impact assessment -------------------------

export type ImpactClass = 'impacted' | 'not_impacted' | 'review';
export type Directness = 'direct' | 'indirect';

export interface Severity {
  responsibilities: number; // 0–3
  relationships: number;
  tools: number;
  behaviours: number;
}

export interface ImpactDecision {
  classification: ImpactClass;
  directness: Directness | null;
  severity: Severity | null;
  rationale: string;
  decidedAt: string;
  /** Recommendation the consultant saw when deciding (for conflict detection). */
  basedOnRec: ImpactClass | null;
}

export type AssessmentStatus = 'proposed' | 'needs_review' | 'confirmed' | 'rejected';

/** Stored consultant layer for a stakeholder × dimension cell. Recommendations are derived live. */
export interface ImpactAssessment {
  id: string; // `${stakeholderId}|${dimensionId}`
  stakeholderId: ID;
  dimensionId: ID;
  decision: ImpactDecision | null;
  status: AssessmentStatus;
  comments: Comment[];
}

// ----------------------------- Milestones --------------------------------

export interface Phase {
  id: ID;
  num: number;
  name: string;
  short: string;
}

export type MilestoneKind = 'milestone' | 'recurring' | 'scenario' | 'exception';

export type Focus =
  | 'governance' | 'leadership' | 'programme' | 'impacted' | 'sensitive_people' | 'managers'
  | 'hr' | 'it' | 'external' | 'procurement' | 'training' | 'awareness' | 'retained'
  | 'support' | 'hypercare' | 'status' | 'golive' | 'feedback' | 'crisis';

export interface CommTrigger {
  required: boolean;
  focus: Focus[];
  objective: string;
  leadTime: number; // in engagement time units, before milestone
  followUp: string;
  artifactHints: ArtifactType[];
}

export interface Milestone {
  id: ID;
  phaseId: ID;
  libraryKey: string | null;
  name: string;
  description: string;
  selected: boolean;
  kind: MilestoneKind;
  waveId: ID | null; // null = engagement-wide (anchored to primary wave)
  anchor: 'date' | 'relative';
  date: ISODate | null;
  relativeOffset: number | null; // in engagement time units vs go-live
  owner: string;
  dependencies: ID[];
  gating: string;
  functions: string[];
  sortOrder: number;
  trigger: CommTrigger;
  recurrence: { cadence: 'weekly' | 'biweekly' | 'monthly'; until: string } | null;
}

// ----------------------------- Communication -----------------------------

export interface CommType {
  id: ID;
  name: string;
  short: string;
  sensitivity: Level3;
  description: string;
}

export interface CommunicatorRole {
  id: ID;
  name: string;
  short: string;
  description: string;
  isCustom: boolean;
}

export type ChannelCategory =
  | 'In-Person / Leadership' | 'Digital' | 'Interactive' | 'Training & Enablement'
  | 'Formal' | 'Operational' | 'Awareness Materials' | 'Custom';

export type ChannelColor =
  | 'amber' | 'purple' | 'blue' | 'green' | 'yellow' | 'rose' | 'teal' | 'slate' | 'indigo' | 'brown';

export interface Channel {
  id: ID;
  name: string;
  category: ChannelCategory;
  color: ChannelColor;
  enabled: boolean;
  isCustom: boolean;
  attrs: {
    twoWay: boolean;
    confidential: boolean;
    scale: 'individual' | 'group' | 'mass';
    auditTrail: boolean;
  };
}

export type Objective =
  | 'inform' | 'align' | 'seek_approval' | 'prepare' | 'engage' | 'train' | 'reassure'
  | 'request_action' | 'escalate' | 'confirm_readiness' | 'announce' | 'reinforce' | 'collect_feedback';

export type ReasonKind =
  | 'direct_impact' | 'indirect_impact' | 'decision' | 'sponsorship' | 'execution'
  | 'dependency' | 'awareness' | 'external' | 'readiness';

export interface AudienceReason {
  kind: ReasonKind;
  text: string;
  focus: Focus;
}

export interface RoleAssignment {
  owner: ID | null;
  primary: ID | null;
  supporting: ID[];
  creator: ID | null;
  approvers: ID[];
}

export interface ChannelPlan {
  primary: ID | null;
  secondary: ID[];
  reinforcement: ID | null;
  followUp: ID | null;
}

export type Tone =
  | 'executive' | 'formal' | 'reassuring' | 'operational' | 'informative' | 'instructional' | 'sensitive' | 'urgent';

export interface MessageBrief {
  mainMessage: string;
  supportingMessages: string[];
  whyItMatters: string;
  whatIsChanging: string[];
  whatIsNotChanging: string;
  expectedImpact: string;
  keyDates: string[];
  requiredActions: string[];
  supportChannels: string[];
  potentialConcerns: string[];
  tone: Tone;
  confidentiality: string;
  anticipatedQuestions: string[];
  approvalRequirements: string;
}

export type CommStatus =
  | 'proposed' | 'needs_review' | 'confirmed' | 'draft_prepared' | 'pending_approval'
  | 'approved' | 'ready' | 'completed' | 'deferred' | 'cancelled';

export interface CommunicationRecord {
  id: ID;
  code: string; // COM-001
  milestoneId: ID;
  audienceId: ID;
  objective: Objective;
  commTypeId: ID;
  priority: Level3;
  origin: 'rule' | 'consultant';
  manualReason: string;
  intendedOutcome: string;
  /** Consultant layer — null means "follow the live recommendation". */
  rolesOverride: RoleAssignment | null;
  channelsOverride: ChannelPlan | null;
  messageOverride: Partial<MessageBrief> | null;
  changeIdsOverride: ID[] | null;
  plannedDateOverride: ISODate | null;
  status: CommStatus;
  hrReviewed: boolean;
  /** Fingerprint of the recommendation inputs when the consultant last confirmed. */
  reviewedFingerprint: string | null;
  comments: Comment[];
  createdAt: string;
  updatedAt: string;
}

// ----------------------------- Artifacts ---------------------------------

export type ArtifactType =
  | 'general_announcement' | 'impacted_email' | 'leadership_announcement' | 'vendor' | 'customer'
  | 'kt_report' | 'training_comm' | 'training_pack' | 'townhall_pack' | 'manager_cascade'
  | 'golive_announcement' | 'hypercare' | 'faq' | 'survey' | 'exec_briefing';

export interface ArtifactSection {
  id: ID;
  key: string;
  heading: string;
  body: string; // markdown-lite: paragraphs, "- " bullets, "### " subheads, "| a | b |" tables
  removed: boolean;
}

export interface ArtifactVersion {
  v: number;
  createdAt: string;
  origin: 'generated' | 'edited' | 'regenerated' | 'section_regenerated' | 'restored';
  note: string;
  meta: { to: string; from: string; subject: string };
  sections: ArtifactSection[];
  sourceFingerprint: string;
  tone: Tone;
  length: ArtifactLength;
}

export type ArtifactLength = 'concise' | 'standard' | 'detailed';
export type ArtifactApproval = 'draft' | 'pending' | 'approved';

export interface Artifact {
  id: ID;
  code: string; // ART-001
  communicationRecordId: ID;
  type: ArtifactType;
  title: string;
  versions: ArtifactVersion[];
  approvalStatus: ArtifactApproval;
  createdAt: string;
  updatedAt: string;
}

export interface KTItem {
  id: ID;
  workstream: string;
  process: string;
  waveId: ID | null;
  ktPhase: 'Planning' | 'Documentation' | 'Shadow' | 'Reverse shadow' | 'Sign-off' | 'Complete';
  reportingPeriod: string;
  plannedActivities: string;
  completedActivities: string;
  openActivities: string;
  readiness: 'not_assessed' | 'on_track' | 'at_risk' | 'off_track';
  issues: string;
  dependencies: string;
  decisions: string;
  nextSteps: string;
}

export interface AuditEvent {
  id: ID;
  at: string;
  entityType: string;
  entityId: ID;
  action: string;
  summary: string;
}

export interface EngagementState {
  schemaVersion: number;
  engagement: Engagement;
  waves: Wave[];
  dimensions: ChangeDimension[];
  changes: ChangeRecord[];
  groups: StakeholderGroup[];
  stakeholders: Stakeholder[];
  assessments: Record<string, ImpactAssessment>;
  phases: Phase[];
  milestones: Milestone[];
  commTypes: CommType[];
  communicatorRoles: CommunicatorRole[];
  framework: Record<ID, Record<ID, string>>; // roleId -> commTypeId -> guidance text
  channels: Channel[];
  comms: CommunicationRecord[];
  artifacts: Artifact[];
  kt: KTItem[];
  audit: AuditEvent[];
  dismissedSuggestions: Record<string, string>; // suggestion key -> fingerprint at dismissal
  counters: { change: number; comm: number; artifact: number };
  // ---- schema v2 ----
  /** Consultant decisions at stakeholder × change × dimension level (key `${stakeholderId}|${changeId}|${dimensionId}`). */
  changeAssessments: Record<string, ChangeLevelDecision>;
  /** Copies of non-built-in templates used by this engagement, so it stays self-contained (key `${templateId}@${version}`). */
  templateSnapshots: Record<string, unknown>;
  /** Rows from an imported change list awaiting consultant resolution. Never silently discarded. */
  importQueue: ImportRow[];
  /** Summary of the last selection change's downstream effect. */
  lastPropagation: PropagationSummary | null;
}

export interface ChangeLevelDecision {
  classification: ImpactClass;
  directness: Directness | null;
  rationale: string;
  decidedAt: string;
  basedOnRec: ImpactClass | null;
}

export interface ImportRow {
  id: string;
  rawTitle: string;
  rawDescription: string;
  rawFunction: string;
  rawDimension: string;
  matchTemplateId: string | null;
  matchScore: number;
  status: 'pending' | 'accepted' | 'custom' | 'dismissed';
  resultChangeId: string | null;
}

export interface PropagationSummary {
  at: string;
  action: string;
  changesAffected: number;
  impactCellsChanged: number;
  newImpactRecommendations: number;
  newAudienceSuggestions: number;
  communicationsFlagged: number;
  milestonesSuggested: number;
  artifactsOutdated: number;
}

export interface EngagementSummary {
  id: ID;
  name: string;
  client: string;
  isDemo: boolean;
  updatedAt: string;
}
