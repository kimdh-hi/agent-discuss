export interface CachePort {
  getJson<T>(key: string): Promise<T | null>;
  setJson(key: string, value: unknown, ttlSec: number): Promise<void>;
  del(key: string): Promise<void>;
  delByPrefix(prefix: string): Promise<void>;
}

export const CACHE_PORT = Symbol('CACHE_PORT');
