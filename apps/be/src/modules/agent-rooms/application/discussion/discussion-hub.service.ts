import { Injectable } from '@nestjs/common';
import { ReplaySubject, Observable } from 'rxjs';
import type { RoomEvent } from './discussion.types';

interface HubEntry {
  subject: ReplaySubject<RoomEvent>;
  completion: Promise<void>;
  controller: AbortController;
}

@Injectable()
export class DiscussionHubService {
  private readonly entries = new Map<string, HubEntry>();

  register(
    topicId: string,
    subject: ReplaySubject<RoomEvent>,
    completion: Promise<void>,
    controller: AbortController,
  ): void {
    this.entries.set(topicId, { subject, completion, controller });
    void completion.finally(() => this.entries.delete(topicId));
  }

  subscribe(topicId: string): Observable<RoomEvent> | null {
    const entry = this.entries.get(topicId);
    return entry ? entry.subject.asObservable() : null;
  }

  cancel(topicId: string): { ok: boolean } {
    const entry = this.entries.get(topicId);
    if (!entry) return { ok: false };
    entry.controller.abort();
    return { ok: true };
  }

  isRunning(topicId: string): boolean {
    return this.entries.has(topicId);
  }
}
