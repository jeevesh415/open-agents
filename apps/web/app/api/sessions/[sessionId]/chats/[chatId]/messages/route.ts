import type { WebAgentUIMessage } from "@/app/types";
import {
  requireAuthenticatedUser,
  requireOwnedSessionChat,
} from "@/app/api/sessions/_lib/session-context";
import { getChatMessages } from "@/lib/db/sessions";
import type { PersistedChatMessagesResponse } from "@/app/sessions/[sessionId]/chats/[chatId]/persisted-response-recovery";

type RouteContext = {
  params: Promise<{ sessionId: string; chatId: string }>;
};

export async function GET(_req: Request, context: RouteContext) {
  const authResult = await requireAuthenticatedUser();
  if (!authResult.ok) {
    return authResult.response;
  }

  const { sessionId, chatId } = await context.params;

  const chatContext = await requireOwnedSessionChat({
    userId: authResult.userId,
    sessionId,
    chatId,
  });
  if (!chatContext.ok) {
    return chatContext.response;
  }

  const { chat } = chatContext;
  const messages = await getChatMessages(chatId);

  const payload: PersistedChatMessagesResponse = {
    messages: messages.map((message) => message.parts as WebAgentUIMessage),
    lastAssistantMessageAt: chat.lastAssistantMessageAt
      ? chat.lastAssistantMessageAt.toISOString()
      : null,
  };

  return Response.json(payload);
}
