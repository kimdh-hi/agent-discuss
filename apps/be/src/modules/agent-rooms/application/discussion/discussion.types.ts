import type { SearchHit } from '../../../rag/application/rag.interfaces';
import type { CachePort } from '../../../../common/cache/cache.port';
export {
  openIssues,
  unresolvedInconsistencies,
} from '../../domain/discussion';
export type {
  DecisionCandidate,
  ContributionAssessment,
  DiscussionBrief,
  DiscussionSnapshot,
  DiscussionTerminalReason,
  DiscussionType,
  Inconsistency,
  Issue,
  IssueStatus,
  ParticipantStat,
  RolePlan,
  RoleRelevance,
} from '../../domain/discussion';
import type { DiscussionSnapshot } from '../../domain/discussion';

export type { SearchHit };

export interface RoomAgentSpec {
  id: string;
  name: string;
  instructions: string;
  model: string;
  description?: string;
  hasKnowledge?: boolean;
  knowledgeScope?: string;
  maxToolIterations?: number;
}

export interface TurnEntry {
  role: 'moderator' | 'agent';
  agentId?: string;
  agentName: string;
  round: number;
  content: string;
}

export interface RecalledMemory {
  content: string;
  kind: string;
  confidence: number;
}

export interface DiscussionRunOptions {
  threadId?: string;
  initialTurnLog?: TurnEntry[];
  historySummary?: string;
  initialTurn?: number;
  skipGate?: boolean;
  signal?: AbortSignal;
  initialSnapshot?: DiscussionSnapshot;
  agentMemories?: Record<string, RecalledMemory[]>;
  ragCache?: CachePort;
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
