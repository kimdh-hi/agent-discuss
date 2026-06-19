import { Injectable } from '@nestjs/common';

@Injectable()
export class DiscussionConfig {
  readonly model = process.env.LLM_MODEL || 'gpt-4o-mini';
}
