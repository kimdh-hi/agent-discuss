import { Injectable } from '@nestjs/common';
import { Observable, ReplaySubject } from 'rxjs';
import { RoomEvent } from './orchestrator.types';

interface HubEntry {
  stream: ReplaySubject<RoomEvent>;
  abort: AbortController;
  done: boolean;
}

@Injectable()
export class DiscussionHubService {
  private readonly entries = new Map<string, HubEntry>();

  register(
    topicId: string,
    stream: ReplaySubject<RoomEvent>,
    completion: Promise<void>,
    abort: AbortController,
  ): void {
    const entry: HubEntry = { stream, abort, done: false };
    this.entries.set(topicId, entry);
    void completion
      .catch(() => {})
      .finally(() => {
        entry.done = true;
        this.entries.delete(topicId);
      });
  }

  subscribe(topicId: string): Observable<RoomEvent> | null {
    const entry = this.entries.get(topicId);
    return entry ? entry.stream.asObservable() : null;
  }

  cancel(topicId: string): boolean {
    const entry = this.entries.get(topicId);
    if (!entry) return false;
    entry.abort.abort();
    return true;
  }

  isActive(topicId: string): boolean {
    const entry = this.entries.get(topicId);
    return !!entry && !entry.done;
  }
}
