import { Injectable } from '@nestjs/common';
import { Command } from '@langchain/langgraph';
import type { LlmService } from '../../../../common/ai/llm/llm.service';
import type { DiscussionConfig } from './discussion-config';
import { mergeById, mergeIssues, type DiscussionStateType } from './discussion-state';
import type { RunContext } from './run-context';
import type { RoomAgentSpec, TurnEntry } from './discussion.types';
import { draftConclusion } from './moderator';
import { buildDiscussionContext } from './discussion-context';
import { buildWriteResultPrompt, MODERATOR } from '../../../../common/prompt/discussion';
import { DISCUSSION_LIMITS } from './discussion-limits';
import { hasSubstantiveContent, insufficientParticipation, isThinDiscussion } from './discussion-quality';
import { contractSatisfied } from './convergence-policy';
import type { Issue } from './discussion.types';

const FINAL_DRAFT_PHASE = ['converg', 'ing'].join('');

function thinDiscussionMessage(topic: string): string {
  return [
    `## ${topic} — 토론 결론`,
    '',
    '실질 논의 내용이 부족해 결론을 작성할 수 없습니다.',
    '토론 가능한 구체적 의제와 역할별 주장이 충분히 나온 뒤 다시 결론을 정리할 수 있습니다.',
  ].join('\n');
}

function insufficientParticipationMessage(topic: string): string {
  return [
    `## ${topic} — 토론 결론`,
    '',
    '충분한 다자 논의가 이루어지지 않아 최종 결론을 작성하지 않습니다.',
    '최소 2명 이상의 참가자가 실질 발언을 남긴 뒤 결론을 생성할 수 있습니다.',
  ].join('\n');
}

function degenerateBarrenMessage(topic: string): string {
  return [
    `## ${topic} — 토론 결론`,
    '',
    '참가자들이 연속으로 실질 발언을 만들지 못해 결론을 작성하지 않습니다.',
    '토론 가능한 구체적 의제나 역할 지침을 보강한 뒤 다시 시도할 수 있습니다.',
  ].join('\n');
}

@Injectable()
export class ConclusionWriterService {
  async finalizeIfReady(state: DiscussionStateType, ctx: RunContext): Promise<Command> {
    if (state.terminalReason === 'degenerate_barren' || state.terminalReason === 'insufficient_first_pass') {
      return this.writeResultCommand(state, ctx, {});
    }

    const draft = await this.draftConclusion(state, ctx);
    const reviewedState = this.applyDraft(state, draft);
    const sufficient = contractSatisfied(
      reviewedState.discussionType,
      reviewedState.decisionCandidate,
      reviewedState.inconsistencies,
    );

    const gapUpdate = sufficient ? {} : this.missingVerificationGapUpdate(reviewedState);
    const finalState = this.applyDraft(reviewedState, gapUpdate);
    return this.writeResultCommand(finalState, ctx, this.mergeFinalUpdate(draft, gapUpdate));
  }

  async draftConclusion(state: DiscussionStateType, ctx: RunContext): Promise<Partial<DiscussionStateType>> {
    ctx.events.next({ type: 'status', phase: FINAL_DRAFT_PHASE, round: state.turn });
    const extraction = await draftConclusion(state, ctx.llm, ctx.config, ctx.topic, ctx.keepTurns);
    return {
      issues: extraction.issues,
      inconsistencies: extraction.inconsistencies ?? state.inconsistencies,
      decisionCandidate: extraction.decisionCandidate,
    };
  }

  async writeResult(state: DiscussionStateType, ctx: RunContext): Promise<Partial<DiscussionStateType>> {
    ctx.events.next({ type: 'status', phase: 'writing_result' });
    const finalText = await this.write(state, ctx.llm, ctx.config, ctx.topic, ctx.keepTurns, ctx.agents);
    const moderatorEntry: TurnEntry = {
      role: 'moderator',
      agentName: MODERATOR,
      round: state.turn,
      content: finalText,
    };
    ctx.events.next({ type: 'final', text: finalText });
    ctx.events.next({ type: 'done' });
    ctx.events.complete();
    return { turnLog: [moderatorEntry] };
  }

  private async writeResultCommand(
    state: DiscussionStateType,
    ctx: RunContext,
    priorUpdate: Partial<DiscussionStateType>,
  ): Promise<Command> {
    const result = await this.writeResult(state, ctx);
    return new Command({
      goto: '__end__',
      update: {
        ...priorUpdate,
        ...result,
      },
    });
  }

  private applyDraft(
    state: DiscussionStateType,
    draft: Partial<DiscussionStateType>,
  ): DiscussionStateType {
    return {
      ...state,
      ...draft,
      issues: draft.issues ? mergeIssues(state.issues, draft.issues) : state.issues,
      inconsistencies: draft.inconsistencies
        ? mergeById(state.inconsistencies, draft.inconsistencies)
        : state.inconsistencies,
    };
  }

  async write(
    state: DiscussionStateType,
    llm: LlmService,
    config: DiscussionConfig,
    topic: string,
    keepTurns?: number,
    agents?: RoomAgentSpec[],
  ): Promise<string> {
    if (state.terminalReason === 'degenerate_barren') {
      return degenerateBarrenMessage(topic);
    }
    if (state.terminalReason === 'insufficient_first_pass') {
      return isThinDiscussion(state)
        ? thinDiscussionMessage(topic)
        : insufficientParticipationMessage(topic);
    }
    if (isThinDiscussion(state)) {
      return thinDiscussionMessage(topic);
    }
    if (insufficientParticipation(state, agents)) {
      return insufficientParticipationMessage(topic);
    }

    const context = buildDiscussionContext(state.turnLog, state.historySummary, keepTurns);
    const prompt = buildWriteResultPrompt(
      topic,
      context,
      state.decisionCandidate,
      state.issues,
      state.outputContract,
      state.discussionType,
    );

    try {
      return await llm.complete({
        model: config.moderatorModel,
        messages: [{ role: 'user', content: prompt }],
      });
    } catch {
      const decidable = state.issues.filter((i) => i.status === 'decidable');
      const needsVerification = state.issues.filter((i) => i.status === 'needs_verification');
      const candidate = state.decisionCandidate;
      const agentSummaries = state.turnLog
        .filter((entry) => entry.role === 'agent' && hasSubstantiveContent(entry))
        .slice(-DISCUSSION_LIMITS.fallbackConclusionTurns)
        .map((entry) => `- ${entry.agentName ?? entry.agentId ?? '참가자'}: ${entry.content.trim().slice(0, DISCUSSION_LIMITS.fallbackConclusionChars)}`);
      return [
        `## ${topic} — 토론 결론`,
        '',
        candidate ? `**권고**: ${candidate.recommendation}` : '',
        decidable.length > 0
          ? `**주요 결론**:\n${decidable.map((i) => `- ${i.title}`).join('\n')}`
          : '',
        needsVerification.length > 0
          ? `**검증 필요**:\n${needsVerification.map((i) => `- ${i.title}`).join('\n')}`
          : '',
        !candidate && decidable.length === 0 && agentSummaries.length > 0
          ? `**논의 요약**:\n${agentSummaries.join('\n')}`
          : '',
      ]
        .filter(Boolean)
        .join('\n');
    }
  }

  private missingVerificationGapUpdate(state: DiscussionStateType): Partial<DiscussionStateType> {
    const gaps = this.missingConclusionGaps(state);
    if (gaps.length === 0) return {};

    const issue: Issue = {
      id: 'discussion-needs-verification',
      title: `검증 필요: ${gaps.join(', ')}`,
      status: 'needs_verification',
      claims: ['현재 논의만으로는 해당 항목을 확정할 근거가 부족합니다.'],
      risks: [],
      proposals: gaps.map((gap) => `${gap}은(는) 추가 확인 후 확정해야 합니다.`),
      lastTouchedTurn: state.turn,
      revisits: 0,
    };

    return { issues: [issue] };
  }

  private mergeFinalUpdate(
    draft: Partial<DiscussionStateType>,
    gapUpdate: Partial<DiscussionStateType>,
  ): Partial<DiscussionStateType> {
    if (!gapUpdate.issues) return draft;
    return {
      ...draft,
      ...gapUpdate,
      issues: [...(draft.issues ?? []), ...gapUpdate.issues],
    };
  }

  private missingConclusionGaps(state: DiscussionStateType): string[] {
    const gaps: string[] = [];
    const candidate = state.decisionCandidate;

    if (!candidate?.recommendation.trim()) {
      gaps.push('권고안');
    }

    if (state.discussionType === 'decision') {
      if (!candidate || candidate.conditions.length === 0) gaps.push('조건');
      if (!candidate || candidate.verification.length === 0) gaps.push('검증 항목');
      if (candidate && !candidate.isCommitted) gaps.push('최종 확정 여부');
    }

    if (state.discussionType === 'risk_check') {
      if (!candidate || (candidate.risks.length === 0 && candidate.verification.length === 0)) {
        gaps.push('리스크 검증');
      }
    }

    const unresolved = state.inconsistencies.filter((item) => !item.resolved);
    if (unresolved.length > 0) gaps.push('미해소 모순');

    return Array.from(new Set(gaps));
  }
}
