import { Injectable, Logger } from '@nestjs/common';
import { Command } from '@langchain/langgraph';
import { DiscussionState } from './discussion-state';
import { ModeratorService } from './moderator.service';
import { SpeakerService } from './speaker.service';
import { RunContext } from './run-context';
import { MODERATOR, prompts } from './prompts';

@Injectable()
export class TopicSetupService {
  private readonly logger = new Logger(TopicSetupService.name);

  constructor(
    private readonly moderator: ModeratorService,
    private readonly speaker: SpeakerService,
  ) {}

  async validateTopic(state: DiscussionState, ctx: RunContext, skip: boolean): Promise<Command> {
    if (skip) return new Command({ goto: 'defineAgenda' });
    ctx.events.next({ type: 'status', phase: 'validateTopic', detail: '주제 검토 중' });
    const valid = await this.moderator.validateTopic(ctx.topic);
    return new Command({ goto: valid ? 'defineAgenda' : 'rejectTopic' });
  }

  async rejectTopic(ctx: RunContext): Promise<Partial<DiscussionState>> {
    const { content } = await this.speaker.speak(
      ctx.events,
      { role: 'moderator', agentName: MODERATOR, round: 0 },
      prompts.rejectTopic(ctx.topic),
      { silent: true },
    );
    ctx.events.next({ type: 'final', text: content });
    return { turnLog: [{ role: 'moderator', agentName: MODERATOR, round: 0, content }] };
  }

  async defineAgenda(state: DiscussionState, ctx: RunContext): Promise<Partial<DiscussionState>> {
    if (state.outputContract.length > 0) return {};
    ctx.events.next({ type: 'status', phase: 'defineAgenda', detail: '토픽 분류 중' });
    const { discussionType, outputContract, options } = await this.moderator.defineAgenda(ctx.topic, ctx.agents);
    this.logger.log(`[defineAgenda] type: ${discussionType}, contract: [${outputContract.join(', ')}], options: [${options.join(', ')}]`);
    ctx.events.next({ type: 'status', phase: 'defineAgenda', detail: `유형: ${discussionType}` });
    return { discussionType, outputContract, options };
  }
}
