const MARKDOWN_PROGRESS_SYNTAX = /[\s*_`~>#\-[\]()|:]/g;

export function markdownVisibleProgress(text: string): string {
  return text.replace(MARKDOWN_PROGRESS_SYNTAX, '');
}

export function nextMarkdownVisibleSlice(
  current: string,
  target: string,
  charsPerTick: number,
): string {
  if (!target.startsWith(current)) return target;
  if (current.length >= target.length) return current;

  let nextLength = Math.min(target.length, current.length + charsPerTick);
  const currentProgress = markdownVisibleProgress(current);

  while (
    nextLength < target.length &&
    markdownVisibleProgress(target.slice(0, nextLength)) === currentProgress
  ) {
    nextLength += 1;
  }

  return target.slice(0, nextLength);
}
