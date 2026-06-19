import { z } from 'zod';
import { LlmTool } from '../llm/llm.types';

export const SIGNAL_TURN_TOOL = 'signal_turn';

export interface TurnSignal {
  yieldTo: string | null;
  passReason: string | null;
  done: boolean;
}

export const NO_SIGNAL: TurnSignal = { yieldTo: null, passReason: null, done: false };

export function buildSignalTurnTool(): LlmTool {
  return {
    name: SIGNAL_TURN_TOOL,
    description:
      'Call this exactly once, as the final action of your turn, to hand the floor over. Set done=true only when you consider the agenda sufficiently discussed. Set yieldTo to the id of the participant you most want to hear from next, or null to leave it open.',
    schema: z.object({
      done: z.boolean().describe('true if the agenda is sufficiently discussed and may wrap up'),
      yieldTo: z.string().nullish().describe('id of the next participant you want to hear from, or null'),
      passReason: z.string().nullish().describe('short reason for the yield, or null'),
    }),
    async execute() {
      return { content: 'ok' };
    },
  };
}

export function toTurnSignal(args: Record<string, unknown>): TurnSignal {
  const yieldTo = typeof args.yieldTo === 'string' && args.yieldTo.trim() ? args.yieldTo : null;
  const passReason = typeof args.passReason === 'string' && args.passReason.trim() ? args.passReason : null;
  return { yieldTo, passReason, done: args.done === true };
}
