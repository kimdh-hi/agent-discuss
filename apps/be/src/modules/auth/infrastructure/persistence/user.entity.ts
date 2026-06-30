import { defineEntity, p } from '@mikro-orm/core';
import { randomUUID } from 'node:crypto';

const UserSchema = defineEntity({
  name: 'User',
  tableName: 'users',
  properties: {
    id: p.uuid().primary().onCreate(() => randomUUID()),
    email: p.string().unique(),
    createdAt: p.datetime().onCreate(() => new Date()),
  },
});

export class User extends UserSchema.class {}

UserSchema.setClass(User);
