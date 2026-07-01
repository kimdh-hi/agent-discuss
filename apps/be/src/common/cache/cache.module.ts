import { Global, Module } from '@nestjs/common';
import { CACHE_PORT } from './cache.port';
import { InMemoryCacheService } from './in-memory-cache.service';

function createCachePort(): InMemoryCacheService {
  return new InMemoryCacheService({
    enabled: process.env.DISCUSS_CACHE_ENABLED !== 'false',
    maxEntries: Number(process.env.DISCUSS_CACHE_MAX_ENTRIES ?? 1000),
  });
}

@Global()
@Module({
  providers: [
    {
      provide: CACHE_PORT,
      useFactory: createCachePort,
    },
  ],
  exports: [CACHE_PORT],
})
export class CacheModule {}
