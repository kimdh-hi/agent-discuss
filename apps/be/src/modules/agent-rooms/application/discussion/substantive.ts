import type { ClaimExtraction } from './parsers';
import type { DiscussionStateType } from './discussion-state';
import type { ContributionAssessment } from './discussion.types';
import { coreDiscussionCriteria, issueMatchesCriteria } from './discussion-focus';

export interface ClaimProgressLike {
  newClaims: number;
  repeatClaims: number;
}

export interface ContributionAssessmentInput {
  speech: string;
  extraction: ClaimExtraction;
  state: DiscussionStateType;
  progress: ClaimProgressLike;
  topic?: string;
}

export function assessTextContribution(text: string): ContributionAssessment {
  return text.trim().length > 0 ? 'substantive' : 'empty';
}

export function isSubstantiveText(text: string): boolean {
  return assessTextContribution(text) !== 'empty';
}

export function assessContribution(input: ContributionAssessmentInput): ContributionAssessment {
  if (assessTextContribution(input.speech) === 'empty') return 'empty';
  if (isOffTopic(input)) return 'off_topic';
  if (input.progress.newClaims > 0) return 'substantive';
  if (input.progress.repeatClaims > 0 || input.extraction.repeatClaims > 0) return 'repeat';
  return 'repeat';
}

export function effectiveProgressForAssessment(
  assessment: ContributionAssessment,
  progress: ClaimProgressLike,
): ClaimProgressLike {
  if (assessment === 'substantive') return progress;
  return {
    newClaims: 0,
    repeatClaims: Math.max(1, progress.repeatClaims + progress.newClaims),
  };
}

function isOffTopic(input: ContributionAssessmentInput): boolean {
  if (allExtractedIssuesOutOfScope(input.extraction)) return true;
  if (allExtractedIssuesOutsideCoreCriteria(input)) return true;
  return briefMarksSpeechOutOfScope(input);
}

function allExtractedIssuesOutOfScope(extraction: ClaimExtraction): boolean {
  if (extraction.issues.length === 0) return false;
  const hasDecisionProgress = Boolean(extraction.decisionCandidate?.recommendation.trim());
  const hasInconsistency = extraction.inconsistencies.length > 0;
  return !hasDecisionProgress
    && !hasInconsistency
    && extraction.issues.every((issue) => issue.status === 'out_of_scope');
}

function allExtractedIssuesOutsideCoreCriteria(input: ContributionAssessmentInput): boolean {
  const coreCriteria = coreDiscussionCriteria(input.state.brief, input.state.outputContract);
  if (coreCriteria.length === 0 || input.extraction.issues.length === 0) return false;
  const hasDecisionProgress = Boolean(input.extraction.decisionCandidate?.recommendation.trim());
  const hasInconsistency = input.extraction.inconsistencies.length > 0;
  return !hasDecisionProgress
    && !hasInconsistency
    && input.extraction.issues.every((issue) => !issueMatchesCriteria(issue, coreCriteria));
}

function briefMarksSpeechOutOfScope(input: ContributionAssessmentInput): boolean {
  const outOfScope = input.state.brief?.outOfScope ?? [];
  if (outOfScope.length === 0) return false;
  const speech = normalize(input.speech);
  return outOfScope.some((item) => {
    const normalized = normalize(item);
    if (!normalized) return false;
    if (speech.includes(normalized)) return true;
    return tokenOverlap(speech, normalized);
  });
}

function normalize(text: string): string {
  return text.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
}

function tokenOverlap(a: string, b: string): boolean {
  const aTokens = new Set(a.split(/[^a-z0-9가-힣]+/).filter((token) => token.length >= 2));
  const bTokens = b.split(/[^a-z0-9가-힣]+/).filter((token) => token.length >= 2);
  if (bTokens.length === 0) return false;
  const overlap = bTokens.filter((token) => aTokens.has(token)).length;
  return overlap >= Math.min(2, bTokens.length);
}
