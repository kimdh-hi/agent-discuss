import { Injectable } from '@nestjs/common';
import { Command } from '@langchain/langgraph';
import type { DiscussionStateType } from './discussion-state';
import type { Issue, RoomAgentSpec, TurnEntry } from './discussion.types';
import type { RunContext } from './run-context';
import type { LlmService } from '../../../../common/ai/llm/llm.service';
import type { DiscussionConfig } from './discussion-config';
import type { ClaimExtraction } from './parsers';
import { extractClaims } from './moderator';
import { speak } from './speaker';
import { convergePressure } from './convergence-policy';
import { isAborted, abortCommand } from './run-context';
import { renderTurnLog } from './turn-log';
import { DISCUSSION_LIMITS } from './discussion-limits';
import { buildCompactHistoryPrompt, buildResummarizePrompt } from '../../../../common/prompt/discussion';
import { calibrateClaimProgress, isSimilarIdea, jaccard } from './discussion-progress';
import { assessContribution, effectiveProgressForAssessment, type ClaimProgressLike } from './substantive';

export function normalizeRecommendation(text: string): string {
  return text.trim().toLowerCase().replace(/[^\w\s가-힣]/g, '').replace(/\s+/g, ' ');
}

export function isSameRecommendation(a: string, b: string): boolean {
  const na = normalizeRecommendation(a);
  const nb = normalizeRecommendation(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  const tokensA = new Set(na.split(' ').filter(Boolean));
  const tokensB = new Set(nb.split(' ').filter(Boolean));
  return jaccard(tokensA, tokensB) >= 0.9;
}

@Injectable()
export class TurnService {
  async speak(state: DiscussionStateType, ctx: RunContext): Promise<Command> {
    if (isAborted(ctx, state)) return abortCommand();
    const update = await this.runSpeak(state, ctx.agents, ctx, ctx.llm, ctx.config, ctx.topic);
    const goto = update.turn === undefined ? 'moderate' : 'updateIssues';
    return new Command({ goto, update });
  }

  async updateIssues(state: DiscussionStateType, ctx: RunContext): Promise<Partial<DiscussionStateType>> {
    const lastEntry = [...state.turnLog].reverse().find((e) => e.role === 'agent');
    const speech = lastEntry?.content ?? '';
    return this.runUpdateIssues(state, ctx.llm, ctx.config, speech, ctx.topic);
  }

  async compactHistory(state: DiscussionStateType, ctx: RunContext): Promise<Partial<DiscussionStateType>> {
    return this.runCompactHistory(state, ctx.llm, ctx.config, ctx.keepTurns);
  }

  async runSpeak(
    state: DiscussionStateType,
    agents: RoomAgentSpec[],
    ctx: RunContext,
    llm: LlmService,
    config: DiscussionConfig,
    topic: string,
  ): Promise<Partial<DiscussionStateType>> {
    if (ctx.signal.aborted || state.aborted) {
      return { aborted: true };
    }

    const agent = agents.find((a) => a.id === state.nextSpeakerId) ?? agents[0];
    if (!agent) return { aborted: true };

    const convergePressureHint = convergePressure(state, ctx.maxTurns, ctx.initialTurn);
    const result = await speak(agent, state, ctx, llm, config, topic, convergePressureHint);

    if (!result.substantive) {
      const newStreak = state.barrenStreak + 1;
      const update: Partial<DiscussionStateType> = {
        barrenStreak: newStreak,
      };
      if (newStreak >= DISCUSSION_LIMITS.maxConsecutiveBarren) {
        update.terminalReason = 'degenerate_barren';
      }
      return update;
    }

    const newTurnLog: TurnEntry[] = [result.entry];

    return {
      turn: state.turn + 1,
      turnLog: newTurnLog,
      participantStats: { [agent.id]: { turns: 1, newClaims: 0, repeatClaims: 0 } },
      barrenStreak: 0,
    };
  }

  async runUpdateIssues(
    state: DiscussionStateType,
    llm: LlmService,
    config: DiscussionConfig,
    lastSpeech: string,
    topic: string = '',
  ): Promise<Partial<DiscussionStateType>> {
    const extraction = await extractClaims(
      lastSpeech,
      state.turn,
      state,
      llm,
      config,
      topic,
    );

    const lastEntry = [...state.turnLog].reverse().find((e) => e.role === 'agent');
    const progress = this.correctRecentSpeechRepeat(
      calibrateClaimProgress(extraction, state),
      extraction,
      state,
      lastSpeech,
      lastEntry?.agentId,
    );
    const assessment = assessContribution({
      speech: lastSpeech,
      extraction,
      state,
      progress,
      topic,
    });
    const effectiveProgress = effectiveProgressForAssessment(assessment, progress);

    const newDrought =
      assessment !== 'substantive' ||
      effectiveProgress.newClaims === 0 ||
      effectiveProgress.repeatClaims > effectiveProgress.newClaims
        ? state.droughtCount + 1
        : 0;

    const newCandidate = assessment === 'substantive'
      ? extraction.decisionCandidate ?? state.decisionCandidate
      : state.decisionCandidate;

    const stats: typeof state.participantStats = {};
    if (lastEntry?.agentId) {
      stats[lastEntry.agentId] = {
        turns: 0,
        newClaims: effectiveProgress.newClaims,
        repeatClaims: effectiveProgress.repeatClaims,
      };
    }

    return {
      issues: assessment === 'substantive'
        ? this.touchExtractedIssues(extraction.issues, state)
        : [],
      inconsistencies: assessment === 'substantive' ? extraction.inconsistencies : [],
      decisionCandidate: newCandidate,
      droughtCount: newDrought,
      participantStats: stats,
    };
  }

  private touchExtractedIssues(issues: Issue[], state: DiscussionStateType): Issue[] {
    const existing = new Map(state.issues.map((issue) => [issue.id, issue]));
    return issues.map((issue) => {
      const prev = existing.get(issue.id);
      const lastTouchedTurn =
        issue.lastTouchedTurn > (prev?.lastTouchedTurn ?? 0)
          ? issue.lastTouchedTurn
          : state.turn;
      return {
        ...issue,
        lastTouchedTurn,
        revisits: prev ? issue.revisits : (issue.revisits ?? 0),
      };
    });
  }

  private correctRecentSpeechRepeat(
    progress: ClaimProgressLike,
    extraction: ClaimExtraction,
    state: DiscussionStateType,
    speech: string,
    agentId?: string,
  ): ClaimProgressLike {
    if (!this.isRecentSpeechRepeat(state, speech, agentId)) return progress;
    if (this.hasStructuredProgress(extraction, state)) return progress;
    return {
      newClaims: 0,
      repeatClaims: Math.max(1, progress.repeatClaims + progress.newClaims),
    };
  }

  private isRecentSpeechRepeat(state: DiscussionStateType, speech: string, agentId?: string): boolean {
    const normalizedSpeech = speech.trim();
    if (!normalizedSpeech) return false;

    const agentEntries = state.turnLog.filter((entry) => entry.role === 'agent' && entry.content.trim());
    const previousEntries =
      agentEntries[agentEntries.length - 1]?.content === speech
        ? agentEntries.slice(0, -1)
        : agentEntries;

    const windowRepeat = previousEntries
      .slice(-DISCUSSION_LIMITS.compactKeepTurns)
      .some((entry) => isSimilarIdea(normalizedSpeech, entry.content));
    if (windowRepeat) return true;

    if (agentId) return this.isSameSpeakerRepeat(state, normalizedSpeech, agentId, previousEntries);
    return false;
  }

  private isSameSpeakerRepeat(
    state: DiscussionStateType,
    normalizedSpeech: string,
    agentId: string,
    previousEntries: DiscussionStateType['turnLog'],
  ): boolean {
    const sameAgentPrior = previousEntries
      .filter((entry) => entry.agentId === agentId)
      .slice(-2);
    return sameAgentPrior.some((entry) => isSimilarIdea(normalizedSpeech, entry.content));
  }

  private hasStructuredProgress(extraction: ClaimExtraction, state: DiscussionStateType): boolean {
    if (extraction.issues.length > 0 || extraction.inconsistencies.length > 0) return true;
    return this.conclusionBucketsAdvanced(state.decisionCandidate, extraction.decisionCandidate);
  }

  private conclusionBucketsAdvanced(
    previous: DiscussionStateType['decisionCandidate'],
    incoming: ClaimExtraction['decisionCandidate'],
  ): boolean {
    if (!incoming?.recommendation.trim()) return false;
    if (!previous?.recommendation.trim()) return true;
    if (!isSameRecommendation(incoming.recommendation, previous.recommendation)) return true;
    if (previous.conditions.length === 0 && incoming.conditions.length > 0) return true;
    if (previous.risks.length === 0 && incoming.risks.length > 0) return true;
    if (previous.verification.length === 0 && incoming.verification.length > 0) return true;
    return !previous.isCommitted && incoming.isCommitted;
  }

  async runCompactHistory(
    state: DiscussionStateType,
    llm: LlmService,
    config: DiscussionConfig,
    keepTurns: number = DISCUSSION_LIMITS.compactKeepTurns,
  ): Promise<Partial<DiscussionStateType>> {
    if (state.turnLog.length <= keepTurns) return {};

    const toCompress = state.turnLog.slice(
      state.summarizedUntilTurn,
      state.turnLog.length - keepTurns,
    );
    if (toCompress.length === 0) return {};

    const maxChars = DISCUSSION_LIMITS.maxHistorySummaryChars;
    const rendered = renderTurnLog(toCompress);
    const prompt = buildCompactHistoryPrompt(rendered, maxChars);
    const summary = await llm.complete({
      model: config.moderatorModel,
      messages: [{ role: 'user', content: prompt }],
    });

    const combined = state.historySummary
      ? `${state.historySummary}\n\n${summary}`
      : summary;

    let finalSummary = combined;
    if (combined.length > maxChars) {
      try {
        const resummarized = await llm.complete({
          model: config.moderatorModel,
          messages: [{ role: 'user', content: buildResummarizePrompt(combined, maxChars) }],
        });
        finalSummary = resummarized.length <= maxChars
          ? resummarized
          : combined.slice(0, maxChars);
      } catch {
        finalSummary = combined.slice(0, maxChars);
      }
    }

    return {
      historySummary: finalSummary,
      summarizedUntilTurn: state.turnLog.length - keepTurns,
    };
  }
}
