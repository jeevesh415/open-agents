import { getRun } from "workflow/api";
import {
  requireAuthenticatedUser,
  requireOwnedChatById,
} from "@/app/api/chat/_lib/chat-context";
import type { WebAgentUIMessage } from "@/app/types";
import {
  upsertChatMessageScoped,
  updateChatAssistantActivity,
} from "@/lib/db/sessions";

type RouteContext = {
  params: Promise<{ chatId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const authResult = await requireAuthenticatedUser();
  if (!authResult.ok) {
    return authResult.response;
  }

  const { chatId } = await context.params;

  const chatContext = await requireOwnedChatById({
    userId: authResult.userId,
    chatId,
  });
  if (!chatContext.ok) {
    return chatContext.response;
  }

  const { chat } = chatContext;

  if (!chat.activeStreamId) {
    return Response.json({ success: true });
  }

  // Persist the latest client-side assistant message snapshot before
  // cancelling so mid-step output is not lost on abrupt stop.
  try {
    const body: unknown = await request.json().catch(() => null);
    if (isStopRequestWithMessage(body)) {
      await persistAssistantSnapshot(chatId, body.assistantMessage);
    }
  } catch {
    // Best-effort — don't block cancellation if persistence fails.
  }

  try {
    const run = getRun(chat.activeStreamId);
    await run.cancel();
  } catch (error) {
    console.error(
      `[workflow] Failed to cancel workflow run for chat ${chatId}:`,
      error,
    );
    return Response.json(
      { error: "Failed to cancel workflow run" },
      { status: 500 },
    );
  }

  return Response.json({ success: true });
}

async function persistAssistantSnapshot(
  chatId: string,
  message: WebAgentUIMessage,
): Promise<void> {
  const result = await upsertChatMessageScoped({
    id: message.id,
    chatId,
    role: "assistant",
    parts: message,
  });
  if (result.status === "inserted") {
    await updateChatAssistantActivity(chatId, new Date());
  }
}

function isStopRequestWithMessage(
  value: unknown,
): value is { assistantMessage: WebAgentUIMessage } {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  if (!("assistantMessage" in value) || !value.assistantMessage) {
    return false;
  }
  const msg = value.assistantMessage;
  return (
    typeof msg === "object" &&
    msg !== null &&
    "id" in msg &&
    typeof msg.id === "string" &&
    "role" in msg &&
    msg.role === "assistant" &&
    "parts" in msg &&
    Array.isArray(msg.parts)
  );
}
