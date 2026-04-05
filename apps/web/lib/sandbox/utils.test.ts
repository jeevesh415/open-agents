import { describe, expect, test } from "bun:test";
import {
  hasLegacyRuntimeSandboxState,
  hasLiveRuntimeSandboxState,
  hasRuntimeSandboxState,
  isSandboxMissingError,
} from "./utils";

describe("sandbox runtime state helpers", () => {
  test("treats persistent name-only state as resumable but not live runtime state", () => {
    const persistentState = {
      type: "vercel" as const,
      name: "session_session-1",
    };

    expect(hasRuntimeSandboxState(persistentState)).toBe(true);
    expect(hasLegacyRuntimeSandboxState(persistentState)).toBe(false);
    expect(hasLiveRuntimeSandboxState(persistentState)).toBe(false);
  });

  test("treats persistent state with expiresAt as a live runtime session", () => {
    const persistentState = {
      type: "vercel" as const,
      name: "session_session-1",
      expiresAt: Date.now() + 60_000,
    };

    expect(hasRuntimeSandboxState(persistentState)).toBe(true);
    expect(hasLiveRuntimeSandboxState(persistentState)).toBe(true);
  });

  test("keeps legacy sandboxId state marked as runtime state", () => {
    const legacyState = {
      type: "vercel" as const,
      sandboxId: "sandbox-1",
    };

    expect(hasRuntimeSandboxState(legacyState)).toBe(true);
    expect(hasLegacyRuntimeSandboxState(legacyState)).toBe(true);
    expect(hasLiveRuntimeSandboxState(legacyState)).toBe(true);
  });

  test("detects missing-sandbox errors without matching generic unavailable errors", () => {
    expect(isSandboxMissingError("Status code 404 is not ok")).toBe(true);
    expect(isSandboxMissingError("Sandbox not found")).toBe(true);
    expect(isSandboxMissingError("Sandbox is stopped")).toBe(false);
  });
});
