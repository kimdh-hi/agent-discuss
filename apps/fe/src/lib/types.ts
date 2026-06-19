export interface User {
  id: string;
  email: string;
}

export interface Workspace {
  id: string;
  name: string;
}

export interface Agent {
  id: string;
  name: string;
  instructions: string;
  model: string;
  description?: string;
  workspaceId: string;
}

export interface Document {
  id: string;
  filename: string;
  status: 'processing' | 'ready' | 'failed';
  chunkCount: number;
  error?: string | null;
  stage?: string;
}

export interface Room {
  id: string;
  name: string;
  workspaceId: string;
}

export interface RoomTopic {
  id: string;
  roomId: string;
  title: string;
  status: 'open' | 'running' | 'completed' | 'failed';
  finalText?: string | null;
  completedAt?: string | null;
  createdAt: string;
}

export interface RoomTopicMessage {
  id: string;
  role: 'user' | 'agent' | 'moderator';
  agentId?: string;
  agentName?: string;
  round?: number;
  content: string;
  createdAt: string;
}

export interface RoomAgentSpec {
  id: string;
  name: string;
  model: string;
}

export interface ToolCall {
  name: string;
  args: Record<string, unknown>;
}

export interface SourceHit {
  filename: string;
  score: number;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  toolCalls?: ToolCall[];
  sources?: SourceHit[];
  pending?: boolean;
}

export interface RoomTurn {
  agentId: string;
  agentName: string;
  round: number;
  role: string;
  content: string;
  toolCalls?: ToolCall[];
  sources?: SourceHit[];
  done: boolean;
}
