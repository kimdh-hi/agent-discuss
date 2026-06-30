import { Injectable } from '@nestjs/common';
import { DiscussionState } from './discussion-state';
import { DISCUSSION_LIMITS } from './discussion-limits';
import { DecisionCandidate, DiscussionType } from './orchestrator.types';

@Injectable()
export class ConvergencePolicyService {
  shouldConverge(state: DiscussionState, maxTurns: number, initialTurn: number): boolean {
    const hasNewTurns = state.turn > initialTurn;
    if (state.turn >= maxTurns && hasNewTurns) return true;
    if (state.droughtCount >= DISCUSSION_LIMITS.droughtLimit) return true;
    const span = maxTurns - initialTurn;
    const progressed = span > 0 ? (state.turn - initialTurn) / span : 0;
    if (progressed >= DISCUSSION_LIMITS.forceConvergeRatio) return true;
    return state.issues.some(
      (issue) => issue.status === 'open' && issue.revisits >= DISCUSSION_LIMITS.oscillationLimit,
    );
  }

  convergePressure(state: DiscussionState, maxTurns: number, initialTurn: number): string {
    if (state.converging) {
      return 'The discussion has entered the convergence stage. Focus on finalizing the conclusion rather than opening new points; if there is no disagreement, end now (done=true).';
    }
    const span = maxTurns - initialTurn;
    const progressed = (state.turn - initialTurn) / span;
    if (span > 0 && progressed >= DISCUSSION_LIMITS.lateStageRatio) {
      return 'The discussion is in its later half. Refrain from expanding into side topics and steer toward wrapping up the conclusion.';
    }
    return '';
  }

  contractSatisfied(type: DiscussionType, candidate: DecisionCandidate | null): boolean {
    if (!candidate || !candidate.recommendation.trim()) return false;
    if (!candidate.isCommitted) return false;
    if (type === 'decision') {
      return candidate.conditions.length > 0 && candidate.verification.length > 0;
    }
    return true;
  }
}
