import { Module } from '@nestjs/common';
import { DiscussionService } from './discussion.service';
import { DEFAULT_DISCUSSION_CONFIG, DISCUSSION_CONFIG } from './discussion-config';
import { TurnService } from './turn.service';
import { RoutingService } from './routing.service';
import { ConclusionWriterService } from './conclusion-writer.service';
import { DiscussionHubService } from './discussion-hub.service';

@Module({
  providers: [
    { provide: DISCUSSION_CONFIG, useValue: DEFAULT_DISCUSSION_CONFIG },
    DiscussionService,
    TurnService,
    RoutingService,
    ConclusionWriterService,
    DiscussionHubService,
  ],
  exports: [DiscussionService, DiscussionHubService],
})
export class DiscussionModule {}
