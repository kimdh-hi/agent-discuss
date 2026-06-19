import { Injectable } from '@nestjs/common';
import { StateGraph, START, END, Command } from '@langchain/langgraph';
import { DiscussionState } from './discussion-state';

export interface DiscussionNodes {
  validateTopic(state: DiscussionState): Promise<Command>;
  rejectTopic(state: DiscussionState): Promise<Partial<DiscussionState>>;
  defineAgenda(state: DiscussionState): Promise<Partial<DiscussionState>>;
  moderate(state: DiscussionState): Promise<Command>;
  speak(state: DiscussionState): Promise<Command>;
  updateIssues(state: DiscussionState): Promise<Partial<DiscussionState>>;
  compactHistory(state: DiscussionState): Promise<Partial<DiscussionState>>;
  draftConclusion(state: DiscussionState): Promise<Partial<DiscussionState>>;
  reviewConclusion(state: DiscussionState): Promise<Command>;
  writeResult(state: DiscussionState): Promise<Partial<DiscussionState>>;
}

@Injectable()
export class DiscussionGraphFactory {
  compile(nodes: DiscussionNodes) {
    return new StateGraph(DiscussionState)
      .addNode('validateTopic', nodes.validateTopic, { ends: ['defineAgenda', 'rejectTopic'] })
      .addNode('rejectTopic', nodes.rejectTopic)
      .addNode('defineAgenda', nodes.defineAgenda)
      .addNode('moderate', nodes.moderate, { ends: ['speak', 'draftConclusion', END] })
      .addNode('speak', nodes.speak, { ends: ['updateIssues', END] })
      .addNode('updateIssues', nodes.updateIssues)
      .addNode('compactHistory', nodes.compactHistory)
      .addNode('draftConclusion', nodes.draftConclusion)
      .addNode('reviewConclusion', nodes.reviewConclusion, { ends: ['writeResult', 'speak'] })
      .addNode('writeResult', nodes.writeResult)
      .addEdge(START, 'validateTopic')
      .addEdge('rejectTopic', END)
      .addEdge('defineAgenda', 'moderate')
      .addEdge('updateIssues', 'compactHistory')
      .addEdge('compactHistory', 'moderate')
      .addEdge('draftConclusion', 'reviewConclusion')
      .addEdge('writeResult', END)
      .compile();
  }
}
