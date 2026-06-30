import { Module } from '@nestjs/common';
import { OrchestratorService } from './orchestrator.service';
import { ModeratorService } from './moderator.service';
import { SpeakerService } from './speaker.service';
import { DiscussionHubService } from './discussion-hub.service';
import { ConvergencePolicyService } from './convergence-policy.service';
import { SpeakerSelectorService } from './speaker-selector.service';
import { ConclusionWriterService } from './conclusion-writer.service';
import { DiscussionConfig } from './discussion-config';
import { TopicSetupService } from './topic-setup.service';
import { RoutingService } from './routing.service';
import { TurnService } from './turn.service';
import { LedgerService } from './ledger.service';

@Module({
  providers: [
    OrchestratorService,
    ModeratorService,
    SpeakerService,
    DiscussionHubService,
    ConvergencePolicyService,
    SpeakerSelectorService,
    ConclusionWriterService,
    DiscussionConfig,
    TopicSetupService,
    RoutingService,
    TurnService,
    LedgerService,
  ],
  exports: [OrchestratorService, DiscussionHubService],
})
export class OrchestratorModule {}
