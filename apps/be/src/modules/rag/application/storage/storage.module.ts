import { Module } from '@nestjs/common';
import { FILE_STORAGE } from './storage.types';
import { LocalFsStorageService } from './local-fs-storage.service';

@Module({
  providers: [{ provide: FILE_STORAGE, useClass: LocalFsStorageService }],
  exports: [FILE_STORAGE],
})
export class StorageModule {}
