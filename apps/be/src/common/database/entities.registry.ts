import { User } from '../../modules/auth/infrastructure/persistence/user.entity';
import { Workspace } from '../../modules/workspaces/infrastructure/persistence/workspace.entity';
import { WorkspaceMember } from '../../modules/workspaces/infrastructure/persistence/workspace-member.entity';
import { Agent } from '../../modules/agents/infrastructure/persistence/agent.entity';
import { Room } from '../../modules/agent-rooms/infrastructure/persistence/room.entity';
import { RoomTopic } from '../../modules/agent-rooms/infrastructure/persistence/room-topic.entity';
import { RoomTopicMessage } from '../../modules/agent-rooms/infrastructure/persistence/room-topic-message.entity';
import { RoomAgent } from '../../modules/agent-rooms/infrastructure/persistence/room-agent.entity';
import { Message } from '../../modules/agent-rooms/infrastructure/persistence/message.entity';
import { Document } from '../../modules/rag/infrastructure/persistence/document.entity';
import { DocumentChunk } from '../../modules/rag/infrastructure/persistence/document-chunk.entity';

export {
  User,
  Workspace,
  WorkspaceMember,
  Agent,
  Room,
  RoomTopic,
  RoomTopicMessage,
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
  RoomTopicMessage,
  RoomAgent,
  Message,
];

export const RAG_ENTITIES = [Document, DocumentChunk];
