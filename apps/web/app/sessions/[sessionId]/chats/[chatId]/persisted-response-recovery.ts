import type { WebAgentUIMessage } from "@/app/types";
import type { Chat, ChatMessage } from "@/lib/db/schema";

export const PERSISTED_RESPONSE_RECOVERY_POLL_MS = 1_500;
export const PERSISTED_RESPONSE_RECOVERY_TIMEOUT_MS = 20_000;

type PersistedMessageLike = Pick<WebAgentUIMessage, "role">;
type PersistedMessageWithTimestamp = Pick<ChatMessage, "role" | "createdAt">;
type RecoveryChatState = Pick<
  Chat,
  "activeStreamId" | "lastAssistantMessageAt"
>;

export interface PersistedChatMessagesResponse {
  messages: WebAgentUIMessage[];
  lastAssistantMessageAt: string | null;
}

export function hasPersistedAssistantMessage(
  messages: PersistedMessageLike[],
): boolean {
  return messages.at(-1)?.role === "assistant";
}

export function shouldAwaitPersistedAssistant(input: {
  chat: RecoveryChatState;
  messages: PersistedMessageWithTimestamp[];
}): boolean {
  const { chat, messages } = input;
  if (chat.activeStreamId) {
    return false;
  }

  const lastMessage = messages.at(-1);
  if (!lastMessage || lastMessage.role !== "user") {
    return false;
  }

  if (!chat.lastAssistantMessageAt) {
    return true;
  }

  return (
    chat.lastAssistantMessageAt.getTime() < lastMessage.createdAt.getTime()
  );
}
