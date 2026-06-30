import { useEffect, useMemo, useState } from 'react';
import { nextMarkdownVisibleSlice } from '../../lib/markdown-typewriter';
import type { DisplayItem } from './room-state';

const TYPEWRITER_INTERVAL_MS = 10;
const TYPEWRITER_CHARS_PER_TICK = 2;

type VisibleContentById = Record<string, string>;

type AnimItem = Extract<DisplayItem, { kind: 'turn' }> | Extract<DisplayItem, { kind: 'final' }>;

interface RoomTypewriterState {
  items: DisplayItem[];
  activeAgentId: string | null;
  typing: boolean;
}

function isAnim(item: DisplayItem): item is AnimItem {
  return item.kind === 'turn' || item.kind === 'final';
}

function animFull(item: AnimItem): string {
  return item.kind === 'turn' ? item.content : item.text;
}

function nextVisibleText(current: string, target: string): string {
  return nextMarkdownVisibleSlice(current, target, TYPEWRITER_CHARS_PER_TICK);
}

function initialVisibleText(item: AnimItem): string {
  return animFull(item);
}

function newItemVisibleText(item: AnimItem): string {
  if (item.kind === 'turn') return item.timestamp ? item.content : '';
  return item.id === 'final-hydrate' ? item.text : '';
}

function createInitialVisibleById(items: DisplayItem[]): VisibleContentById {
  const visibleById: VisibleContentById = {};
  for (const item of items) {
    if (isAnim(item)) visibleById[item.id] = initialVisibleText(item);
  }
  return visibleById;
}

function visibleTextFor(item: AnimItem, visibleById: VisibleContentById) {
  return visibleById[item.id] ?? newItemVisibleText(item);
}

function findActiveTypingItem(items: DisplayItem[], visibleById: VisibleContentById) {
  return items.find(
    (item): item is AnimItem =>
      isAnim(item) && visibleTextFor(item, visibleById).length < animFull(item).length,
  );
}

function createSequentialVisibleItems(
  items: DisplayItem[],
  visibleById: VisibleContentById,
): DisplayItem[] {
  const visibleItems: DisplayItem[] = [];

  for (const item of items) {
    if (!isAnim(item)) {
      visibleItems.push(item);
      continue;
    }

    const visible = visibleTextFor(item, visibleById);
    const stillTyping = visible.length < animFull(item).length;
    if (item.kind === 'turn') {
      visibleItems.push({ ...item, content: visible, done: stillTyping ? false : item.done });
    } else {
      visibleItems.push({ ...item, text: visible, streaming: stillTyping });
    }

    if (stillTyping) break;
  }

  return visibleItems;
}

export function useRoomTypewriterState(items: DisplayItem[]): RoomTypewriterState {
  const [visibleById, setVisibleById] = useState<VisibleContentById>(() =>
    createInitialVisibleById(items),
  );

  useEffect(() => {
    setVisibleById((previous) => {
      let changed = false;
      const next: VisibleContentById = {};

      for (const item of items) {
        if (!isAnim(item)) continue;

        const previousVisible = previous[item.id];
        const full = animFull(item);
        if (previousVisible === undefined) {
          next[item.id] = newItemVisibleText(item);
        } else if (previousVisible.length > full.length || !full.startsWith(previousVisible)) {
          next[item.id] = full;
        } else {
          next[item.id] = previousVisible;
        }

        if (next[item.id] !== previous[item.id]) changed = true;
      }

      if (!changed && Object.keys(previous).length === Object.keys(next).length) return previous;
      return next;
    });
  }, [items]);

  useEffect(() => {
    if (!findActiveTypingItem(items, visibleById)) return;

    const timer = window.setTimeout(() => {
      setVisibleById((previous) => {
        const activeItem = findActiveTypingItem(items, previous);
        if (!activeItem) return previous;

        const next = { ...previous };
        const current = visibleTextFor(activeItem, next);
        const typed = nextVisibleText(current, animFull(activeItem));

        if (typed === current) return previous;
        next[activeItem.id] = typed;
        return next;
      });
    }, TYPEWRITER_INTERVAL_MS);

    return () => window.clearTimeout(timer);
  }, [items, visibleById]);

  return useMemo(() => {
    const activeItem = findActiveTypingItem(items, visibleById);
    return {
      activeAgentId: activeItem && activeItem.kind === 'turn' ? activeItem.agentId || null : null,
      typing: Boolean(activeItem),
      items: createSequentialVisibleItems(items, visibleById),
    };
  }, [items, visibleById]);
}

export function useRoomTypewriterItems(items: DisplayItem[]): DisplayItem[] {
  return useRoomTypewriterState(items).items;
}
