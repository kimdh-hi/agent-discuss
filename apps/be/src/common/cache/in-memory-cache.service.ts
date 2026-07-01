import { Injectable } from '@nestjs/common';
import type { CachePort } from './cache.port';

interface CacheEntry {
  value: unknown;
  expiresAt: number;
}

export interface InMemoryCacheOptions {
  enabled: boolean;
  maxEntries: number;
}

@Injectable()
export class InMemoryCacheService implements CachePort {
  private readonly store = new Map<string, CacheEntry>();

  constructor(private readonly options: InMemoryCacheOptions) {}

  async getJson<T>(key: string): Promise<T | null> {
    if (!this.options.enabled) return null;
    const entry = this.store.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= Date.now()) {
      this.store.delete(key);
      return null;
    }
    return entry.value as T;
  }

  async setJson(key: string, value: unknown, ttlSec: number): Promise<void> {
    if (!this.options.enabled) return;
    this.store.delete(key);
    if (this.store.size >= this.options.maxEntries) {
      const oldestKey = this.store.keys().next().value;
      if (oldestKey !== undefined) this.store.delete(oldestKey);
    }
    this.store.set(key, { value, expiresAt: Date.now() + ttlSec * 1000 });
  }

  async del(key: string): Promise<void> {
    if (!this.options.enabled) return;
    this.store.delete(key);
  }

  async delByPrefix(prefix: string): Promise<void> {
    if (!this.options.enabled) return;
    for (const key of this.store.keys()) {
      if (key.startsWith(prefix)) this.store.delete(key);
    }
  }
}
