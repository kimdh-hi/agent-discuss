import { Injectable, Logger } from '@nestjs/common';
import { Subject } from 'rxjs';
import { LlmService } from '../llm/llm.service';
import { LlmTool } from '../llm/llm.types';
import { SearchHit } from '../rag/rag.interfaces';
import { RoomEvent } from './orchestrator.types';
import { Prompt, toMessages } from './prompts';
import { DiscussionConfig } from './discussion-config';
import {
  buildSignalTurnTool,
  extractSignalFromText,
  NO_SIGNAL,
  SIGNAL_TEXT_MARKER,
  SIGNAL_TURN_TOOL,
  toTurnSignal,
  TurnSignal,
} from './control-tool';

const SIGNAL_MARKER_TAIL = 16;

export interface SpeakerMeta {
  role: 'moderator' | 'agent';
  agentId?: string;
  agentName: string;
  round: number;
}

export interface SpeakResult {
  content: string;
  yieldTo: string | null;
  passReason: string | null;
  done: boolean;
}

interface SpeakOptions {
  silent?: boolean;
  tools?: LlmTool[];
  model?: string;
  maxToolIterations?: number;
}

@Injectable()
export class SpeakerService {
  private readonly logger = new Logger(SpeakerService.name);

  constructor(
    private readonly llm: LlmService,
    private readonly config: DiscussionConfig,
  ) {}

  async speak(
    events: Subject<RoomEvent>,
    meta: SpeakerMeta,
    prompt: Prompt,
    options: SpeakOptions = {},
  ): Promise<SpeakResult> {
    const model = options.model ?? this.config.model;
    this.logger.log(`[tool:llm:stream] ${meta.role} "${meta.agentName}" R${meta.round} (model: ${model})`);

    events.next({
      type: 'turn_start',
      role: meta.role,
      agentId: meta.agentId,
      agentName: meta.agentName,
      round: meta.round,
    });

    const tools = options.silent ? options.tools : [...(options.tools ?? []), buildSignalTurnTool()];

    let content = '';
    let signal: TurnSignal = NO_SIGNAL;
    let capturedFromTool = false;
    let pending = '';
    let signalSeen = false;

    for await (const part of this.llm.stream({
      model,
      messages: toMessages(prompt),
      tools,
      maxToolIterations: options.maxToolIterations,
    })) {
      if (part.type === 'tool_call' && part.name === SIGNAL_TURN_TOOL) {
        signal = toTurnSignal(part.args);
        capturedFromTool = true;
        break;
      }
      if (part.type === 'tool_call') {
        this.logger.log(`[tool:${part.name}] "${meta.agentName}" R${meta.round} call — ${JSON.stringify(part.args)}`);
        events.next({ type: 'tool', agentId: meta.agentId, name: part.name, args: part.args, round: meta.round });
      } else if (part.type === 'tool_result') {
        const hits = (part.meta as SearchHit[]) ?? [];
        if (hits.length > 0) events.next({ type: 'source', agentId: meta.agentId, hits });
      } else if (part.type === 'text') {
        content += part.text;
        if (options.silent || signalSeen) continue;
        pending += part.text;
        const markerIdx = pending.search(SIGNAL_TEXT_MARKER);
        if (markerIdx >= 0) {
          this.emitContent(events, meta.agentId, pending.slice(0, markerIdx));
          signalSeen = true;
          pending = '';
        } else {
          const safe = pending.length - SIGNAL_MARKER_TAIL;
          if (safe > 0) {
            this.emitContent(events, meta.agentId, pending.slice(0, safe));
            pending = pending.slice(safe);
          }
        }
      }
    }

    if (!signalSeen) this.emitContent(events, meta.agentId, pending);

    const fromText = extractSignalFromText(content.trim());
    const finalSignal = capturedFromTool ? signal : fromText.signal;

    events.next({ type: 'turn_end', agentId: meta.agentId });
    return {
      content: fromText.cleaned.trim(),
      yieldTo: finalSignal.yieldTo,
      passReason: finalSignal.passReason,
      done: finalSignal.done,
    };
  }

  private emitContent(events: Subject<RoomEvent>, agentId: string | undefined, text: string): void {
    if (text) events.next({ type: 'content', agentId, text });
  }
}
