import { Command, END } from '@langchain/langgraph';
import { Subject } from 'rxjs';
import { RoomAgentSpec, RoomEvent } from './orchestrator.types';

export interface RunContext {
  topic: string;
  agents: RoomAgentSpec[];
  events: Subject<RoomEvent>;
  maxTurns: number;
  initialTurn: number;
  signal?: AbortSignal;
}

export interface SpeakerChoice {
  agent: RoomAgentSpec | null;
  yieldStreak: number;
  converge: boolean;
}

export function isAborted(ctx: RunContext, state?: { aborted?: boolean }): boolean {
  return !!ctx.signal?.aborted || !!state?.aborted;
}

export function abortCommand(): Command {
  return new Command({ goto: END, update: { aborted: true } });
}
