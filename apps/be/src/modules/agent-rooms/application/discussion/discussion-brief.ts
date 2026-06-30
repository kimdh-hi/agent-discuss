import type {
  DiscussionBrief,
  DiscussionType,
  RolePlan,
  RoleRelevance,
  RoomAgentSpec,
} from './discussion.types';
import { coreDiscussionCriteria, matchesAnyCriterion } from './discussion-focus';

export function normalizeDiscussionBrief(input: {
  topic: string;
  agents: RoomAgentSpec[];
  discussionType: DiscussionType;
  outputContract: string[];
  brief?: DiscussionBrief | null;
}): DiscussionBrief {
  const fallback = buildFallbackDiscussionBrief(
    input.topic,
    input.agents,
    input.outputContract,
    input.discussionType,
  );
  const source = input.brief ?? fallback;
  const rolePlanByAgentId = new Map((source.rolePlan ?? []).map((plan) => [plan.agentId, plan]));

  return {
    objective: nonEmpty(source.objective, fallback.objective),
    deliverable: nonEmpty(source.deliverable, fallback.deliverable),
    inScope: nonEmptyList(source.inScope, fallback.inScope),
    outOfScope: nonEmptyList(source.outOfScope, fallback.outOfScope),
    requiredDimensions: nonEmptyList(source.requiredDimensions, fallback.requiredDimensions),
    rolePlan: input.agents.map((agent) => normalizeRolePlan(
      agent,
      rolePlanByAgentId.get(agent.id),
      fallback.rolePlan.find((plan) => plan.agentId === agent.id),
    )),
  };
}

export function buildFallbackDiscussionBrief(
  topic: string,
  agents: RoomAgentSpec[],
  outputContract: string[] = [],
  discussionType: DiscussionType = 'brainstorm',
): DiscussionBrief {
  return {
    objective: topic.trim() || '토론 주제의 결론을 정리한다',
    deliverable: outputContract.length > 0
      ? outputContract.join(', ')
      : defaultDeliverable(discussionType),
    inScope: [],
    outOfScope: [],
    requiredDimensions: [],
    rolePlan: agents.map((agent) => ({
      agentId: agent.id,
      agentName: agent.name,
      relevance: 'supporting',
      assignedContribution: `${agent.name} 역할 설명에 근거해 이번 토픽 결론에 직접 필요한 기여만 제시`,
    })),
  };
}

export function rolePlanForAgent(
  brief: DiscussionBrief | null | undefined,
  agentId: string,
): RolePlan | null {
  return brief?.rolePlan.find((plan) => plan.agentId === agentId) ?? null;
}

export function isEligibleAgent(
  brief: DiscussionBrief | null | undefined,
  agentId: string,
): boolean {
  if (!brief || brief.rolePlan.length === 0) return true;
  const plan = rolePlanForAgent(brief, agentId);
  if (!plan) return true;
  return plan.relevance === 'core' || plan.relevance === 'supporting';
}

export function eligibleAgents(
  agents: RoomAgentSpec[],
  brief: DiscussionBrief | null | undefined,
): RoomAgentSpec[] {
  if (!brief || brief.rolePlan.length === 0) return agents;
  return agents.filter((agent) => isEligibleAgent(brief, agent.id));
}

export function coreAgents(
  agents: RoomAgentSpec[],
  brief: DiscussionBrief | null | undefined,
): RoomAgentSpec[] {
  if (!brief || brief.rolePlan.length === 0) return agents;
  return agents.filter((agent) => rolePlanForAgent(brief, agent.id)?.relevance === 'core');
}

export function coreFirstAgents(
  agents: RoomAgentSpec[],
  brief: DiscussionBrief | null | undefined,
): RoomAgentSpec[] {
  const core = coreAgents(agents, brief);
  return core.length > 0 ? core : eligibleAgents(agents, brief);
}

export function eligibleAgentIds(
  agents: RoomAgentSpec[],
  brief: DiscussionBrief | null | undefined,
): string[] {
  return eligibleAgents(agents, brief).map((agent) => agent.id);
}

export function canAgentFillDiscussionGap(
  brief: DiscussionBrief | null | undefined,
  agentId: string,
  openIssueTexts: string[] = [],
  outputContract: string[] = [],
): boolean {
  if (!brief || brief.rolePlan.length === 0) return true;
  const plan = rolePlanForAgent(brief, agentId);
  if (!plan || plan.relevance === 'out_of_scope') return false;
  if (plan.relevance === 'core') return true;
  if (!hasCoreRole(brief) && brief.requiredDimensions.length === 0) return true;

  const contribution = normalizeText(plan.assignedContribution ?? '');
  if (!contribution) return true;

  const gapTexts = [...coreDiscussionCriteria(brief, outputContract), ...openIssueTexts]
    .map(normalizeText)
    .filter(Boolean);
  if (gapTexts.length === 0) return true;

  return matchesAnyCriterion(contribution, gapTexts);
}

function normalizeRolePlan(
  agent: RoomAgentSpec,
  source: RolePlan | undefined,
  fallback: RolePlan | undefined,
): RolePlan {
  const relevance = normalizeRelevance(source?.relevance ?? fallback?.relevance);
  const assignedContribution = nonEmpty(
    source?.assignedContribution,
    fallback?.assignedContribution ?? defaultAssignedContribution(agent),
  );
  const exclusionReason = source?.exclusionReason?.trim() ||
    fallback?.exclusionReason?.trim() ||
    (relevance === 'out_of_scope' ? '이번 토픽 결론에 직접 기여하지 않는 역할로 분류됨' : undefined);

  return {
    agentId: agent.id,
    agentName: nonEmpty(source?.agentName, agent.name),
    relevance,
    assignedContribution,
    exclusionReason,
  };
}

function hasCoreRole(brief: DiscussionBrief): boolean {
  return brief.rolePlan.some((plan) => plan.relevance === 'core');
}

function defaultDeliverable(discussionType: DiscussionType): string {
  if (discussionType === 'decision') return '권고안, 조건, 검증 항목';
  if (discussionType === 'review') return '리뷰 결과, 리스크, 수정 권고';
  if (discussionType === 'risk_check') return '주요 리스크와 검증 계획';
  return '핵심 결론, 권고 사항, 실행 항목';
}

function defaultAssignedContribution(agent: RoomAgentSpec): string {
  return `${agent.name} 역할 설명에 근거해 이번 토픽 결론에 직접 필요한 기여만 제시`;
}

function normalizeRelevance(value: RoleRelevance | undefined): RoleRelevance {
  if (value === 'core' || value === 'supporting' || value === 'out_of_scope') return value;
  return 'supporting';
}

function nonEmpty(value: string | undefined, fallback: string): string {
  const trimmed = value?.trim();
  return trimmed ? trimmed : fallback;
}

function nonEmptyList(value: string[] | undefined, fallback: string[]): string[] {
  const list = uniqueNonEmpty(value ?? []);
  return list.length > 0 ? list : fallback;
}

function uniqueNonEmpty(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function normalizeText(text: string): string {
  return text.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
}
