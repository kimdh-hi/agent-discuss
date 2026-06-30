import type { ClaimExtraction } from './parsers';
import type { DecisionCandidate, Issue } from './discussion.types';
import type { DiscussionStateType } from './discussion-state';
import {
  candidateTexts,
  coreDiscussionCriteria,
  issueMatchesCriteria,
  issueTexts,
} from './discussion-focus';

const MIN_CONTAINMENT_LENGTH = 12;
const SIMILARITY_THRESHOLD = 0.72;
const TOKEN_SIMILARITY_THRESHOLD = 0.68;

interface CalibratedClaimProgress {
  newClaims: number;
  repeatClaims: number;
}

function normalizeIdeaText(text: string): string {
  return text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function isSimilarIdea(a: string, b: string): boolean {
  const left = normalizeIdeaText(a);
  const right = normalizeIdeaText(b);
  if (!left || !right) return false;
  if (left === right) return true;

  const shorter = left.length <= right.length ? left : right;
  const longer = left.length > right.length ? left : right;
  if (
    shorter.length >= MIN_CONTAINMENT_LENGTH &&
    longer.includes(shorter) &&
    shorter.length / longer.length >= 0.55
  ) {
    return true;
  }

  const tokenScore = jaccard(tokenSet(left), tokenSet(right));
  if (tokenScore >= TOKEN_SIMILARITY_THRESHOLD) return true;

  return jaccard(charNgrams(left), charNgrams(right)) >= SIMILARITY_THRESHOLD;
}

export function calibrateClaimProgress(
  extraction: ClaimExtraction,
  state: DiscussionStateType,
): CalibratedClaimProgress {
  const incomingIdeas = collectExtractionIdeas(extraction);
  if (incomingIdeas.length === 0) {
    return {
      newClaims: 0,
      repeatClaims: Math.max(1, extraction.repeatClaims + extraction.newClaims),
    };
  }

  const progressCount =
    conclusionCandidateProgressCount(state.decisionCandidate, extraction.decisionCandidate) +
    issueProgressCount(extraction.issues, state) +
    inconsistencyProgressCount(extraction.inconsistencies, state);

  if (progressCount > 0) {
    const reportedTotal = extraction.newClaims + extraction.repeatClaims;
    return {
      newClaims: progressCount,
      repeatClaims: Math.max(extraction.repeatClaims, reportedTotal - progressCount, 0),
    };
  }

  return {
    newClaims: 0,
    repeatClaims: Math.max(1, extraction.repeatClaims + extraction.newClaims),
  };
}

function issueProgressCount(issues: Issue[], state: DiscussionStateType): number {
  const existingTexts = collectStateIdeas(state);
  const candidate = state.decisionCandidate;
  const framed = hasDecisionFrame(candidate);
  const coreCriteria = coreDiscussionCriteria(state.brief, state.outputContract);

  return issues
    .filter((issue) => issue.status !== 'out_of_scope')
    .filter((issue) => {
      const texts = issueTexts(issue);
      if (texts.length === 0) return false;
      if (!issueMatchesCriteria(issue, coreCriteria)) return false;
      if (!texts.some((text) => isNovelText(text, existingTexts))) return false;
      if (!framed) return true;
      return fillsMissingCandidateBucket(issue, candidate);
    })
    .length;
}

function conclusionCandidateProgressCount(
  previous: DecisionCandidate | null,
  incoming: DecisionCandidate | null,
): number {
  if (!incoming?.recommendation.trim()) return 0;
  if (!previous?.recommendation.trim()) return 1;

  let progress = 0;
  if (!isSimilarIdea(incoming.recommendation, previous.recommendation)) progress += 1;
  if (missingBucketAdvanced(previous.conditions, incoming.conditions)) progress += 1;
  if (missingBucketAdvanced(previous.risks, incoming.risks)) progress += 1;
  if (missingBucketAdvanced(previous.verification, incoming.verification)) progress += 1;
  if (!previous.isCommitted && incoming.isCommitted) progress += 1;
  return progress;
}

function missingBucketAdvanced(previous: string[], incoming: string[]): boolean {
  if (previous.length > 0) return false;
  return incoming.some((item) => normalizeIdeaText(item).length > 0);
}

function inconsistencyProgressCount(
  incoming: ClaimExtraction['inconsistencies'],
  state: DiscussionStateType,
): number {
  const existing = state.inconsistencies;
  return incoming.filter((item) => {
    const prev = existing.find((other) => other.id === item.id);
    if (prev && !prev.resolved && item.resolved) return true;
    return !existing.some((other) => isSimilarIdea(other.description, item.description));
  }).length;
}

function fillsMissingCandidateBucket(issue: Issue, candidate: DecisionCandidate | null): boolean {
  if (!candidate) return true;
  if (issue.status === 'needs_verification' && candidate.verification.length === 0) return true;
  if (issue.risks.length > 0 && candidate.risks.length === 0) return true;
  if (issue.proposals.length > 0 && candidate.conditions.length === 0) return true;
  return false;
}

function hasDecisionFrame(candidate: DecisionCandidate | null): boolean {
  return Boolean(
    candidate?.recommendation.trim() &&
    (candidate.conditions.length > 0 || candidate.risks.length > 0 || candidate.verification.length > 0),
  );
}

function isNovelText(text: string, existingTexts: string[]): boolean {
  const normalized = normalizeIdeaText(text);
  if (!normalized) return false;
  return !existingTexts.some((existing) => isSimilarIdea(normalized, existing));
}

function collectExtractionIdeas(extraction: ClaimExtraction): string[] {
  return [
    ...extraction.issues.flatMap(issueTexts),
    ...candidateTexts(extraction.decisionCandidate),
    ...extraction.inconsistencies.map((item) => item.description),
  ].filter((text) => normalizeIdeaText(text));
}

function collectStateIdeas(state: DiscussionStateType): string[] {
  return [
    ...state.issues.flatMap(issueTexts),
    ...candidateTexts(state.decisionCandidate),
    ...state.inconsistencies.map((item) => item.description),
  ].filter((text) => normalizeIdeaText(text));
}

function tokenSet(text: string): Set<string> {
  return new Set(
    text
      .split(' ')
      .map(normalizeToken)
      .filter((token) => token.length > 1),
  );
}

function normalizeToken(token: string): string {
  return token
    .replace(/(했습니다|하였습니다|합니다|입니다|하였다|했다|하다)$/u, '')
    .replace(/(으로|에서|에게|부터|까지|처럼|보다|은|는|이|가|을|를|와|과|도|만|의|에|로)$/u, '');
}

function charNgrams(text: string, size = 2): Set<string> {
  const compact = text.replace(/\s/g, '');
  if (compact.length <= size) return new Set(compact ? [compact] : []);
  const grams = new Set<string>();
  for (let i = 0; i <= compact.length - size; i += 1) {
    grams.add(compact.slice(i, i + size));
  }
  return grams;
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const item of a) {
    if (b.has(item)) intersection += 1;
  }
  return intersection / new Set([...a, ...b]).size;
}
