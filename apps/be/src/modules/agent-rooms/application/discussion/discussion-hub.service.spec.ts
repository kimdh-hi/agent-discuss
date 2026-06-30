import { DiscussionHubService } from './discussion-hub.service';
import { ReplaySubject } from 'rxjs';
import type { RoomEvent } from './discussion.types';

describe('DiscussionHubService', () => {
  let hub: DiscussionHubService;

  beforeEach(() => {
    hub = new DiscussionHubService();
  });

  it('등록된 topic을 구독할 수 있다', () => {
    const subject = new ReplaySubject<RoomEvent>(10);
    const controller = new AbortController();
    const completion = Promise.resolve();

    hub.register('topic-1', subject, completion, controller);

    const observable = hub.subscribe('topic-1');
    expect(observable).not.toBeNull();
  });

  it('없는 topic 구독 시 null을 반환한다', () => {
    expect(hub.subscribe('nonexistent')).toBeNull();
  });

  it('isRunning이 등록 상태를 정확히 반환한다', () => {
    const subject = new ReplaySubject<RoomEvent>(10);
    const controller = new AbortController();
    const completion = Promise.resolve();

    expect(hub.isRunning('topic-1')).toBe(false);
    hub.register('topic-1', subject, completion, controller);
    expect(hub.isRunning('topic-1')).toBe(true);
  });

  it('cancel이 controller를 abort시키고 ok: true를 반환한다', () => {
    const subject = new ReplaySubject<RoomEvent>(10);
    const controller = new AbortController();
    const completion = Promise.resolve();

    hub.register('topic-1', subject, completion, controller);
    const result = hub.cancel('topic-1');

    expect(result).toEqual({ ok: true });
    expect(controller.signal.aborted).toBe(true);
  });

  it('없는 topic cancel 시 ok: false를 반환한다', () => {
    expect(hub.cancel('nonexistent')).toEqual({ ok: false });
  });

  it('완료 후 topic이 자동 제거된다', async () => {
    const subject = new ReplaySubject<RoomEvent>(10);
    const controller = new AbortController();
    const completion = Promise.resolve();

    hub.register('topic-1', subject, completion, controller);
    await completion;
    await new Promise((r) => setTimeout(r, 0));

    expect(hub.isRunning('topic-1')).toBe(false);
  });
});
