import { apiBlob, apiFetch, apiStream, apiStreamGet } from '../../lib/api';
import type { RoomTopic } from '../../lib/types';

export function createTopic(roomId: string, title: string): Promise<RoomTopic> {
  return apiFetch<RoomTopic>(`/rooms/${roomId}/topics`, {
    method: 'POST',
    body: { title },
  });
}

export function discussNew(roomId: string, topic: string, signal?: AbortSignal): Promise<Response> {
  return apiStream(`/rooms/${roomId}/discuss`, { topic }, signal);
}

export function continueTopic(
  roomId: string,
  topicId: string,
  message: string,
  signal?: AbortSignal,
): Promise<Response> {
  return apiStream(`/rooms/${roomId}/topics/${topicId}/discuss`, { message }, signal);
}

export function streamTopic(
  roomId: string,
  topicId: string,
  signal?: AbortSignal,
): Promise<Response> {
  return apiStreamGet(`/rooms/${roomId}/topics/${topicId}/stream`, signal);
}

export function cancelTopic(roomId: string, topicId: string): Promise<{ ok: boolean }> {
  return apiFetch<{ ok: boolean }>(`/rooms/${roomId}/topics/${topicId}/cancel`, {
    method: 'POST',
  });
}

export async function downloadTopic(roomId: string, topicId: string): Promise<void> {
  const { blob, filename } = await apiBlob(`/rooms/${roomId}/topics/${topicId}/download`);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
