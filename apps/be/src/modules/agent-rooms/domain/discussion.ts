export type DiscussionType = 'decision' | 'review' | 'brainstorm' | 'risk_check';

export type DiscussionTerminalReason = 'degenerate_barren' | 'insufficient_first_pass' | 'stalled_repetition';

export type IssueStatus = 'open' | 'decidable' | 'needs_verification' | 'out_of_scope';

export type RoleRelevance = 'core' | 'supporting' | 'out_of_scope';

export type ContributionAssessment = 'substantive' | 'repeat' | 'off_topic' | 'empty';

export interface Issue {
  id: string;
  title: string;
  status: IssueStatus;
  claims: string[];
  risks: string[];
  proposals: string[];
  ownerRole?: string;
  lastTouchedTurn: number;
  revisits: number;
}

export interface ParticipantStat {
  turns: number;
  newClaims: number;
  repeatClaims: number;
}

export interface DecisionCandidate {
  recommendation: string;
  conditions: string[];
  risks: string[];
  verification: string[];
  isCommitted: boolean;
}

export interface Inconsistency {
  id: string;
  description: string;
  kind: 'arithmetic' | 'unit' | 'contradiction';
  turn: number;
  resolved: boolean;
}

export interface RolePlan {
  agentId: string;
  agentName?: string;
  relevance: RoleRelevance;
  assignedContribution?: string;
  exclusionReason?: string;
}

export interface DiscussionBrief {
  objective: string;
  deliverable: string;
  inScope: string[];
  outOfScope: string[];
  requiredDimensions: string[];
  rolePlan: RolePlan[];
}

export interface DiscussionSnapshot {
  historySummary: string;
  summarizedUntilTurn: number;
  brief?: DiscussionBrief | null;
  issues: Issue[];
  inconsistencies: Inconsistency[];
  decisionCandidate: DecisionCandidate | null;
  discussionType: DiscussionType;
  outputContract: string[];
  options: string[];
  turn: number;
  terminalReason?: DiscussionTerminalReason | null;
  participantStats?: Record<string, ParticipantStat>;
  droughtCount?: number;
}

export function openIssues(issues: Issue[]): Issue[] {
  return issues.filter((issue) => issue.status === 'open');
}

export function unresolvedInconsistencies(items: Inconsistency[]): Inconsistency[] {
  return items.filter((item) => !item.resolved);
}
