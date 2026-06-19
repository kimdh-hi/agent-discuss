import { Opt, PrimaryKey, Property } from '@mikro-orm/core';
import { randomUUID } from 'node:crypto';

export abstract class BaseEntity {
  @PrimaryKey({ type: 'uuid' })
  id: string & Opt = randomUUID();

  @Property({ type: 'datetime' })
  createdAt: Date & Opt = new Date();
}
