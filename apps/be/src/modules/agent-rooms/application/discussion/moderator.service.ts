import { Injectable, Logger } from '@nestjs/common';
import { LlmService } from '../llm/llm.service';
import {
  ClaimExtraction,
  DecisionCandidate,
  DiscussionType,
  Inconsistency,
  Issue,
  openIssues,
  RoomAgentSpec,
  TurnEntry,
} from './orchestrator.types';
import { z } from 'zod';
import { DECISION_CONTRACT, Prompt, prompts, renderIssues, toMessages } from './prompts';
import { DiscussionConfig } from './discussion-config';
import { AgendaSchema, DecisionSchema, IssuesSchema, PickSpeakerSchema, TopicSchema } from './parsers';
import { renderTurnLog } from './turn-log';
import { DISCUSSION_CONTEXT_DEFAULTS, limitText } from './discussion-context';

export interface RouteDecision {
  next: string | null;
  done: boolean;
  reason?: string;
}

export interface AgendaResult {
  discussionType: DiscussionType;
  outputContract: string[];
  options: string[];
}

@Injectable()
export class ModeratorService {
  private readonly logger = new Logger(ModeratorService.name);

  constructor(
    private readonly llm: LlmService,
    private readonly config: DiscussionConfig,
  ) {}

  async validateTopic(topic: string): Promise<boolean> {
    const parsed = await this.askStructured(prompts.validateTopic(topic), TopicSchema);
    return parsed?.valid ?? true;
  }

  async defineAgenda(topic: string, agents: RoomAgentSpec[]): Promise<AgendaResult> {
    const parsed = await this.askStructured(prompts.defineAgenda(topic, agents), AgendaSchema);
    if (!parsed) return { discussionType: 'decision', outputContract: [...DECISION_CONTRACT], options: [] };
    const outputContract =
      parsed.discussionType === 'decision' || parsed.outputContract.length === 0
        ? [...DECISION_CONTRACT]
        : parsed.outputContract;
    return { discussionType: parsed.discussionType, outputContract, options: parsed.options };
  }

  async updateIssues(
    topic: string,
    existingIssues: Issue[],
    decisionCandidate: DecisionCandidate | null,
    latest: TurnEntry,
    speakerRole: string | undefined,
    existingInconsistencies: Inconsistency[] = [],
  ): Promise<ClaimExtraction> {
    this.logger.log(`[tool:updateIssues] update (R${latest.round} ${latest.agentName})`);
    const parsed = await this.askStructured(
      prompts.updateIssues(
        topic,
        existingIssues,
        decisionCandidate,
        latest.agentName,
        speakerRole,
        latest.content,
        existingInconsistencies,
      ),
      IssuesSchema,
    );
    if (!parsed) {
      return { issues: [], newClaims: 1, repeatClaims: 0, decisionCandidate, inconsistencies: [] };
    }
    const issues = parsed.issues.map((issue) => ({ ...issue, lastTouchedTurn: latest.round }));
    const inconsistencies = parsed.inconsistencies.map((item) => ({ ...item, turn: latest.round }));
    return {
      issues,
      newClaims: parsed.newClaims,
      repeatClaims: parsed.repeatClaims,
      decisionCandidate: parsed.decisionCandidate ?? decisionCandidate,
      inconsistencies,
    };
  }

  async draftDecision(
    topic: string,
    issues: Issue[],
    outputContract: string[],
    decisionCandidate: DecisionCandidate | null,
  ): Promise<{ issues: Issue[]; decisionCandidate: DecisionCandidate | null }> {
    this.logger.log(`[tool:draftDecision] draft (${openIssues(issues).length} open issues)`);
    const parsed = await this.askStructured(
      prompts.draftDecision(topic, issues, outputContract, decisionCandidate),
      DecisionSchema,
    );
    if (!parsed) return { issues: [], decisionCandidate };
    const lastTurn = issues.reduce((max, issue) => Math.max(max, issue.lastTouchedTurn), 0);
    const resolved = parsed.issues.map((issue) => ({ ...issue, lastTouchedTurn: lastTurn }));
    return { issues: resolved, decisionCandidate: parsed.decisionCandidate ?? decisionCandidate };
  }

  async pickSpeaker(
    topic: string,
    context: string,
    turnLog: TurnEntry[],
    agents: RoomAgentSpec[],
    lastDone: boolean,
    issues: Issue[] = [],
    options: string[] = [],
    decisionCandidate: DecisionCandidate | null = null,
    convergencePressure = '',
  ): Promise<RouteDecision> {
    this.logger.log(`[tool:pickSpeaker] pick (${turnLog.length} turns so far)`);
    const open = openIssues(issues);
    const decision = await this.askStructured(
      prompts.pickSpeaker(
        topic,
        agents,
        context,
        lastDone,
        open.length ? renderIssues(open) : '',
        options,
        decisionCandidate,
        convergencePressure,
      ),
      PickSpeakerSchema,
    );

    if (decision) {
      if (decision.done) return { next: null, done: true, reason: decision.reason };
      if (decision.next && agents.some((a) => a.id === decision.next)) {
        return { next: decision.next, done: false, reason: decision.reason };
      }
    }

    return this.fallback(turnLog, agents);
  }

  async summarizeHistory(
    topic: string,
    previousSummary: string,
    entries: TurnEntry[],
  ): Promise<string> {
    if (entries.length === 0) return previousSummary;
    this.logger.log(`[tool:summarizeHistory] summarize (${entries.length} entries)`);
    const raw = await this.ask(
      prompts.summarizeHistory(
        topic,
        previousSummary,
        renderTurnLog(entries),
        DISCUSSION_CONTEXT_DEFAULTS.historySummaryMaxChars,
      ),
    );
    const summary = raw.trim() || renderTurnLog(entries);
    return limitText(summary, DISCUSSION_CONTEXT_DEFAULTS.historySummaryMaxChars);
  }

  private fallback(turnLog: TurnEntry[], agents: RoomAgentSpec[]): RouteDecision {
    const spoken = new Set(turnLog.filter((t) => t.agentId).map((t) => t.agentId));
    const pending = agents.find((a) => !spoken.has(a.id));
    if (pending) return { next: pending.id, done: false };
    return { next: null, done: true };
  }

  private ask(prompt: Prompt): Promise<string> {
    return this.llm.complete({ model: this.config.model, messages: toMessages(prompt) });
  }

  private askStructured<T extends Record<string, unknown>>(
    prompt: Prompt,
    schema: z.ZodType<T>,
  ): Promise<T | null> {
    return this.llm.completeStructured({ model: this.config.model, messages: toMessages(prompt) }, schema);
  }
}
