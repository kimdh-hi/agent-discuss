import { Injectable, Logger } from '@nestjs/common';
import { DiscussionState } from './discussion-state';
import { ModeratorService } from './moderator.service';
import { SpeakerService } from './speaker.service';
import { RunContext } from './run-context';
import { buildDiscussionContext, DiscussionContext } from './discussion-context';
import { MODERATOR, prompts } from './prompts';
import { DecisionCandidate, unresolvedInconsistencies } from './orchestrator.types';

@Injectable()
export class ConclusionWriterService {
  private readonly logger = new Logger(ConclusionWriterService.name);

  constructor(
    private readonly moderator: ModeratorService,
    private readonly speaker: SpeakerService,
  ) {}

  async draftConclusion(state: DiscussionState, ctx: RunContext): Promise<Partial<DiscussionState>> {
    let decisionCandidate = state.decisionCandidate;
    const update: Partial<DiscussionState> = {};
    try {
      const result = await this.moderator.draftDecision(
        ctx.topic,
        state.issues,
        state.outputContract,
        state.decisionCandidate,
      );
      if (result.issues.length > 0) update.issues = result.issues;
      decisionCandidate = result.decisionCandidate;
    } catch (err) {
      this.logger.error(`[draftConclusion] decision drafting failed — proceeding with current state: ${(err as Error).message}`);
    }

    const unresolved = unresolvedInconsistencies(state.inconsistencies);
    if (decisionCandidate && unresolved.length > 0) {
      const notes = unresolved.map((item) => `수치 검증 필요: ${item.description}`);
      decisionCandidate = {
        ...decisionCandidate,
        verification: [...new Set([...decisionCandidate.verification, ...notes])],
      };
    }

    update.decisionCandidate = decisionCandidate;
    return update;
  }

  async writeResult(state: DiscussionState, ctx: RunContext): Promise<Partial<DiscussionState>> {
    const context = buildDiscussionContext(state);
    let content: string;
    try {
      ({ content } = await this.speaker.speak(
        ctx.events,
        { role: 'moderator', agentName: MODERATOR, round: state.turn },
        prompts.writeResult(
          ctx.topic,
          state.discussionType,
          state.outputContract,
          state.issues,
          state.decisionCandidate,
          context.text,
        ),
        { silent: true },
      ));
    } catch (err) {
      this.logger.error(`[writeResult] summary generation failed — using fallback: ${(err as Error).message}`);
      ctx.events.next({ type: 'status', phase: 'summary_degraded', detail: '요약 생성에 실패해 임시 결론을 표시합니다.' });
      content = this.fallbackSummary(context, state.decisionCandidate);
    }
    ctx.events.next({ type: 'final', text: content });
    return { turnLog: [{ role: 'moderator', agentName: MODERATOR, round: state.turn, content }] };
  }

  private fallbackSummary(context: DiscussionContext, candidate: DecisionCandidate | null): string {
    if (candidate) {
      return [
        `## 결정\n- ${candidate.recommendation}`,
        `## 채택 조건\n${bullets(candidate.conditions)}`,
        `## 리스크 분류\n${bullets(candidate.risks)}`,
        `## 검증 항목\n${bullets(candidate.verification)}`,
      ].join('\n\n');
    }
    const body = context.historySummary || context.recentTranscript;
    const detail = body ? `\n\n${body}` : '';
    return `## 결정\n- 자동 요약을 생성하지 못했습니다. 아래 토론 내용을 참고하세요.${detail}`;
  }
}

function bullets(items: string[]): string {
  return items.length ? items.map((item) => `- ${item}`).join('\n') : '- 없음';
}
