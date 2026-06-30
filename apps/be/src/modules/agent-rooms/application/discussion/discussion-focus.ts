import type { DecisionCandidate, DiscussionBrief, Issue } from './discussion.types';

export function coreDiscussionCriteria(
  brief: DiscussionBrief | null | undefined,
  outputContract: string[] = [],
): string[] {
  const requiredDimensions = uniqueNonEmpty(brief?.requiredDimensions ?? []);
  return requiredDimensions.length > 0 ? requiredDimensions : uniqueNonEmpty(outputContract);
}

export function issueTexts(issue: Issue): string[] {
  const details = [...issue.claims, ...issue.risks, ...issue.proposals];
  return uniqueNonEmpty([issue.title, ...details]);
}

export function candidateTexts(candidate: DecisionCandidate | null | undefined): string[] {
  if (!candidate) return [];
  return uniqueNonEmpty([
    candidate.recommendation,
    ...candidate.conditions,
    ...candidate.risks,
    ...candidate.verification,
  ]);
}

export function issueMatchesCriteria(issue: Issue, criteria: string[]): boolean {
  const normalizedCriteria = uniqueNonEmpty(criteria);
  if (normalizedCriteria.length === 0) return true;
  return issueTexts(issue).some((text) => matchesAnyCriterion(text, normalizedCriteria));
}

export function matchesAnyCriterion(text: string, criteria: string[]): boolean {
  return criteria.some((criterion) => overlapsMeaningfully(text, criterion));
}

export function overlapsMeaningfully(a: string, b: string): boolean {
  const left = normalizeFocusText(a);
  const right = normalizeFocusText(b);
  if (!left || !right) return false;
  if (left === right) return true;

  const shorter = left.length <= right.length ? left : right;
  const longer = left.length > right.length ? left : right;
  if (shorter.length >= 4 && longer.includes(shorter)) return true;

  const leftTokens = tokenSet(left);
  const rightTokens = tokenSet(right);
  if (leftTokens.size === 0 || rightTokens.size === 0) return false;

  let overlap = 0;
  for (const token of rightTokens) {
    if (leftTokens.has(token)) overlap += 1;
  }
  if (overlap >= Math.min(2, rightTokens.size)) return true;
  return rightTokens.size <= 2 && overlap >= 1;
}

export function normalizeFocusText(text: string): string {
  return text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenSet(text: string): Set<string> {
  return new Set(
    text
      .split(' ')
      .map(normalizeToken)
      .filter((token) => token.length >= 2),
  );
}

function normalizeToken(token: string): string {
  return token
    .replace(/(했습니다|하였습니다|합니다|입니다|이었다|였다|한다|된다|했다|하다|되는|하는)$/u, '')
    .replace(/(으로써|으로서|에게서|에서|에게|부터|까지|처럼|보다|으로|은|는|이|가|을|를|와|과|도|만|의|에|로)$/u, '');
}

function uniqueNonEmpty(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}
