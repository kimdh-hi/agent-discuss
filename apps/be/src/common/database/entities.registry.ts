import { User } from './user.entity';
import { Workspace } from './workspace.entity';
import { WorkspaceMember } from './workspace-member.entity';
import { Agent } from './agent.entity';
import { Room } from './room.entity';
import { RoomTopic } from './room-topic.entity';
import { RoomAgent } from './room-agent.entity';
import { Message } from './message.entity';
import { Document } from './document.entity';
import { DocumentChunk } from './document-chunk.entity';

export {
  User,
  Workspace,
  WorkspaceMember,
  Agent,
  Room,
  RoomTopic,
  RoomAgent,
  Message,
  Document,
  DocumentChunk,
};

export const ALL_ENTITIES = [
  User,
  Workspace,
  WorkspaceMember,
  Agent,
  Room,
  RoomTopic,
  RoomAgent,
  Message,
];

export const RAG_ENTITIES = [Document, DocumentChunk];
