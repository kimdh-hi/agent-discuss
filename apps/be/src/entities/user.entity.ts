import { Entity, Property, Unique } from '@mikro-orm/core';
import { BaseEntity } from './base.entity';

@Entity({ tableName: 'users' })
export class User extends BaseEntity {
  @Property({ type: 'string' })
  @Unique()
  email!: string;
}
