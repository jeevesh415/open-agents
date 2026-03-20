import { beforeEach, describe, expect, mock, test } from "bun:test";

type AuthResult =
  | {
      ok: true;
      userId: string;
    }
  | {
      ok: false;
      response: Response;
    };

type OwnedSessionChatResult =
  | {
      ok: true;
      sessionRecord: { id: string };
      chat: {
        id: string;
        sessionId: string;
        lastAssistantMessageAt: Date | null;
      };
    }
  | {
      ok: false;
      response: Response;
    };

let authResult: AuthResult = { ok: true, userId: "user-1" };
let ownedSessionChatResult: OwnedSessionChatResult = {
  ok: true,
  sessionRecord: { id: "session-1" },
  chat: {
    id: "chat-1",
    sessionId: "session-1",
    lastAssistantMessageAt: null,
  },
};
let persistedMessages = [
  {
    id: "user-1",
    chatId: "chat-1",
    role: "user",
    parts: {
      id: "user-1",
      role: "user",
      parts: [{ type: "text", text: "Hello" }],
    },
    createdAt: new Date("2026-03-20T10:00:00.000Z"),
  },
];

mock.module("@/app/api/sessions/_lib/session-context", () => ({
  requireAuthenticatedUser: async () => authResult,
  requireOwnedSessionChat: async () => ownedSessionChatResult,
}));

mock.module("@/lib/db/sessions", () => ({
  getChatMessages: async () => persistedMessages,
}));

const routeModulePromise = import("./route");

function createContext(sessionId = "session-1", chatId = "chat-1") {
  return {
    params: Promise.resolve({ sessionId, chatId }),
  };
}

describe("/api/sessions/[sessionId]/chats/[chatId]/messages", () => {
  beforeEach(() => {
    authResult = { ok: true, userId: "user-1" };
    ownedSessionChatResult = {
      ok: true,
      sessionRecord: { id: "session-1" },
      chat: {
        id: "chat-1",
        sessionId: "session-1",
        lastAssistantMessageAt: null,
      },
    };
    persistedMessages = [
      {
        id: "user-1",
        chatId: "chat-1",
        role: "user",
        parts: {
          id: "user-1",
          role: "user",
          parts: [{ type: "text", text: "Hello" }],
        },
        createdAt: new Date("2026-03-20T10:00:00.000Z"),
      },
    ];
  });

  test("returns auth error from guard", async () => {
    authResult = {
      ok: false,
      response: Response.json({ error: "Not authenticated" }, { status: 401 }),
    };
    const { GET } = await routeModulePromise;

    const response = await GET(
      new Request(
        "http://localhost/api/sessions/session-1/chats/chat-1/messages",
      ),
      createContext(),
    );

    expect(response.status).toBe(401);
  });

  test("returns ownership error from guard", async () => {
    ownedSessionChatResult = {
      ok: false,
      response: Response.json({ error: "Chat not found" }, { status: 404 }),
    };
    const { GET } = await routeModulePromise;

    const response = await GET(
      new Request(
        "http://localhost/api/sessions/session-1/chats/chat-1/messages",
      ),
      createContext(),
    );

    expect(response.status).toBe(404);
  });

  test("returns the persisted chat snapshot when no assistant is saved yet", async () => {
    const { GET } = await routeModulePromise;

    const response = await GET(
      new Request(
        "http://localhost/api/sessions/session-1/chats/chat-1/messages",
      ),
      createContext(),
    );
    const body = (await response.json()) as {
      messages: Array<{
        id: string;
        role: string;
        parts: Array<{ type: string; text: string }>;
      }>;
      lastAssistantMessageAt: string | null;
    };

    expect(response.status).toBe(200);
    expect(body).toEqual({
      messages: [
        {
          id: "user-1",
          role: "user",
          parts: [{ type: "text", text: "Hello" }],
        },
      ],
      lastAssistantMessageAt: null,
    });
  });

  test("returns the assistant snapshot once it has been persisted", async () => {
    ownedSessionChatResult = {
      ok: true,
      sessionRecord: { id: "session-1" },
      chat: {
        id: "chat-1",
        sessionId: "session-1",
        lastAssistantMessageAt: new Date("2026-03-20T10:00:04.000Z"),
      },
    };
    persistedMessages = [
      ...persistedMessages,
      {
        id: "assistant-1",
        chatId: "chat-1",
        role: "assistant",
        parts: {
          id: "assistant-1",
          role: "assistant",
          parts: [{ type: "text", text: "Done" }],
        },
        createdAt: new Date("2026-03-20T10:00:04.000Z"),
      },
    ];
    const { GET } = await routeModulePromise;

    const response = await GET(
      new Request(
        "http://localhost/api/sessions/session-1/chats/chat-1/messages",
      ),
      createContext(),
    );
    const body = (await response.json()) as {
      messages: Array<{
        id: string;
        role: string;
        parts: Array<{ type: string; text: string }>;
      }>;
      lastAssistantMessageAt: string | null;
    };

    expect(response.status).toBe(200);
    expect(body).toEqual({
      messages: [
        {
          id: "user-1",
          role: "user",
          parts: [{ type: "text", text: "Hello" }],
        },
        {
          id: "assistant-1",
          role: "assistant",
          parts: [{ type: "text", text: "Done" }],
        },
      ],
      lastAssistantMessageAt: "2026-03-20T10:00:04.000Z",
    });
  });
});
