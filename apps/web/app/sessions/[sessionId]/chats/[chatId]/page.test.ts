import { describe, expect, test } from "bun:test";
import { getInitialIsOnlyChatInSession } from "./only-chat-in-session";
import { shouldAwaitPersistedAssistant } from "./persisted-response-recovery";

describe("getInitialIsOnlyChatInSession", () => {
  test("returns true when the current chat is the session's only chat", () => {
    expect(getInitialIsOnlyChatInSession([{ id: "chat-1" }], "chat-1")).toBe(
      true,
    );
  });

  test("returns false when the session already has multiple chats", () => {
    expect(
      getInitialIsOnlyChatInSession(
        [{ id: "chat-1" }, { id: "chat-2" }],
        "chat-1",
      ),
    ).toBe(false);
  });

  test("returns false when chat summaries are stale and do not include the current chat", () => {
    expect(getInitialIsOnlyChatInSession([{ id: "chat-1" }], "chat-2")).toBe(
      false,
    );
  });
});

describe("shouldAwaitPersistedAssistant", () => {
  test("returns true when the latest persisted message is a user turn and there is no active stream", () => {
    expect(
      shouldAwaitPersistedAssistant({
        chat: {
          activeStreamId: null,
          lastAssistantMessageAt: new Date("2026-03-20T09:59:00.000Z"),
        },
        messages: [
          {
            role: "user",
            createdAt: new Date("2026-03-20T10:00:00.000Z"),
          },
        ],
      }),
    ).toBe(true);
  });

  test("returns false when a stream can still be resumed", () => {
    expect(
      shouldAwaitPersistedAssistant({
        chat: {
          activeStreamId: "stream-1",
          lastAssistantMessageAt: null,
        },
        messages: [
          {
            role: "user",
            createdAt: new Date("2026-03-20T10:00:00.000Z"),
          },
        ],
      }),
    ).toBe(false);
  });

  test("returns false when the assistant message is already persisted", () => {
    expect(
      shouldAwaitPersistedAssistant({
        chat: {
          activeStreamId: null,
          lastAssistantMessageAt: new Date("2026-03-20T10:00:02.000Z"),
        },
        messages: [
          {
            role: "user",
            createdAt: new Date("2026-03-20T10:00:00.000Z"),
          },
          {
            role: "assistant",
            createdAt: new Date("2026-03-20T10:00:02.000Z"),
          },
        ],
      }),
    ).toBe(false);
  });
});
