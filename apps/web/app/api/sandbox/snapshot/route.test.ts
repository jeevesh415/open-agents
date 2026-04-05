import { beforeEach, describe, expect, mock, test } from "bun:test";

mock.module("server-only", () => ({}));

const updateCalls: Array<{
  sessionId: string;
  patch: Record<string, unknown>;
}> = [];
const kickCalls: Array<{ sessionId: string; reason: string }> = [];
const connectCalls: Array<{
  state: Record<string, unknown>;
  options?: Record<string, unknown>;
}> = [];

let sessionRecord: {
  id: string;
  userId: string;
  lifecycleVersion: number;
  snapshotUrl: string | null;
  sandboxState: {
    type: "vercel";
    name?: string;
    snapshotId?: string;
    expiresAt?: number;
  } | null;
};

mock.module("@/app/api/sessions/_lib/session-context", () => ({
  requireAuthenticatedUser: async () => ({ ok: true, userId: "user-1" }),
  requireOwnedSession: async () => ({ ok: true, sessionRecord }),
  requireOwnedSessionWithSandboxGuard: async () => ({
    ok: true,
    sessionRecord,
  }),
}));

mock.module("@/lib/db/sessions", () => ({
  updateSession: async (sessionId: string, patch: Record<string, unknown>) => {
    updateCalls.push({ sessionId, patch });
    sessionRecord = {
      ...sessionRecord,
      ...patch,
    } as typeof sessionRecord;
    return sessionRecord;
  },
}));

mock.module("@/lib/sandbox/lifecycle", () => ({
  buildActiveLifecycleUpdate: () => ({
    lifecycleState: "active",
    lifecycleError: null,
  }),
  buildHibernatedLifecycleUpdate: () => ({
    lifecycleState: "hibernated",
    sandboxExpiresAt: null,
    hibernateAfter: null,
    lifecycleRunId: null,
    lifecycleError: null,
  }),
  getNextLifecycleVersion: (current: number | null | undefined) =>
    (current ?? 0) + 1,
}));

mock.module("@/lib/sandbox/lifecycle-kick", () => ({
  kickSandboxLifecycleWorkflow: (input: {
    sessionId: string;
    reason: string;
  }) => {
    kickCalls.push(input);
  },
}));

mock.module("@open-harness/sandbox", () => ({
  connectSandbox: async (
    state: {
      type: "vercel";
      name?: string;
      snapshotId?: string;
    },
    options?: { name?: string },
  ) => {
    connectCalls.push({ state, options });

    if (state.name) {
      throw new Error("Sandbox not found");
    }

    const expiresAt = Date.now() + 60_000;
    return {
      getState: () => ({
        type: "vercel" as const,
        name: options?.name ?? "session_session-1",
        expiresAt,
      }),
    };
  },
}));

const routeModulePromise = import("./route");

describe("/api/sandbox/snapshot persistent restore fallback", () => {
  beforeEach(() => {
    updateCalls.length = 0;
    kickCalls.length = 0;
    connectCalls.length = 0;

    sessionRecord = {
      id: "session-1",
      userId: "user-1",
      lifecycleVersion: 3,
      snapshotUrl: "snap-1",
      sandboxState: {
        type: "vercel",
        name: "session_session-1",
      },
    };
  });

  test("falls back to snapshot restore when persistent sandbox is missing", async () => {
    const { PUT } = await routeModulePromise;

    const response = await PUT(
      new Request("http://localhost/api/sandbox/snapshot", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: "session-1" }),
      }),
    );
    const payload = (await response.json()) as {
      success: boolean;
      migrated?: boolean;
      sandboxName?: string;
      restoredFrom?: string;
    };

    expect(response.ok).toBe(true);
    expect(payload.success).toBe(true);
    expect(payload.migrated).toBe(true);
    expect(payload.sandboxName).toBe("session_session-1");
    expect(payload.restoredFrom).toBe("snap-1");
    expect(connectCalls).toEqual([
      {
        state: { type: "vercel", name: "session_session-1" },
        options: undefined,
      },
      {
        state: { type: "vercel", snapshotId: "snap-1" },
        options: {
          name: "session_session-1",
          timeout: 18_000_000,
          ports: [3000, 5173, 4321, 8000],
        },
      },
    ]);
    expect(updateCalls).toHaveLength(2);
    expect(updateCalls[0]?.patch.sandboxState).toEqual({ type: "vercel" });
    expect(updateCalls[0]?.patch.lifecycleState).toBe("hibernated");
    expect(updateCalls[1]?.patch.sandboxState).toMatchObject({
      type: "vercel",
      name: "session_session-1",
    });
    expect(kickCalls).toEqual([
      {
        sessionId: "session-1",
        reason: "snapshot-restored",
      },
    ]);
  });

  test("returns 409 and clears the broken persistent identity when no snapshot fallback exists", async () => {
    const { PUT } = await routeModulePromise;

    sessionRecord.snapshotUrl = null;

    const response = await PUT(
      new Request("http://localhost/api/sandbox/snapshot", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: "session-1" }),
      }),
    );
    const payload = (await response.json()) as { error: string };

    expect(response.status).toBe(409);
    expect(payload.error).toContain("Create a new sandbox");
    expect(connectCalls).toEqual([
      {
        state: { type: "vercel", name: "session_session-1" },
        options: undefined,
      },
    ]);
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0]?.patch.sandboxState).toEqual({ type: "vercel" });
    expect(updateCalls[0]?.patch.lifecycleState).toBe("provisioning");
    expect(kickCalls).toHaveLength(0);
  });
});
