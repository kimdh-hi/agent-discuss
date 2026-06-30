import { SearchHit } from '../rag/rag.interfaces';

export interface RoomAgentSpec {
  id: string;
  name: string;
  instructions: string;
  model: string;
  description?: string;
  tools?: string[];
  maxToolIterations?: number;
}

export type DiscussionType = 'decision' | 'review' | 'brainstorm' | 'risk_check';

export type IssueStatus = 'open' | 'decidable' | 'needs_verification' | 'out_of_scope';

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

export interface ClaimExtraction {
  issues: Issue[];
  newClaims: number;
  repeatClaims: number;
  decisionCandidate: DecisionCandidate | null;
  inconsistencies: Inconsistency[];
}

export function openIssues(issues: Issue[]): Issue[] {
  return issues.filter((issue) => issue.status === 'open');
}

export function unresolvedInconsistencies(items: Inconsistency[]): Inconsistency[] {
  return items.filter((item) => !item.resolved);
}

export interface TurnEntry {
  role: 'moderator' | 'agent';
  agentId?: string;
  agentName: string;
  round: number;
  content: string;
}

export interface DiscussionRunOptions {
  initialTurnLog?: TurnEntry[];
  historySummary?: string;
  initialTurn?: number;
  skipGate?: boolean;
  signal?: AbortSignal;
}

export type RoomEvent =
  | { type: 'status'; phase: string; round?: number; detail?: string }
  | { type: 'tool'; agentId?: string; name: string; args: Record<string, unknown>; round?: number }
  | { type: 'source'; agentId?: string; hits: SearchHit[] }
  | { type: 'turn_start'; role: 'moderator' | 'agent'; agentId?: string; agentName: string; round: number }
  | { type: 'content'; agentId?: string; text: string }
  | { type: 'turn_end'; agentId?: string }
  | { type: 'final'; text: string }
  | { type: 'error'; message: string }
  | { type: 'done' };
