"use client";

import { useEffect, useRef, useState } from "react";
import type { WebAgentUIMessage } from "@/app/types";
import type { ChatUiStatus } from "@/lib/chat-streaming-state";
import {
  hasPersistedAssistantMessage,
  PERSISTED_RESPONSE_RECOVERY_POLL_MS,
  PERSISTED_RESPONSE_RECOVERY_TIMEOUT_MS,
  type PersistedChatMessagesResponse,
} from "../persisted-response-recovery";

type PersistedResponseRecoveryState = "idle" | "recovering" | "timed_out";

type UsePersistedResponseRecoveryParams = {
  sessionId: string;
  chatId: string;
  status: ChatUiStatus;
  enabled: boolean;
  messages: WebAgentUIMessage[];
  setMessages: (messages: WebAgentUIMessage[]) => void;
  onRecovered?: () => void;
};

export function usePersistedResponseRecovery({
  sessionId,
  chatId,
  status,
  enabled,
  messages,
  setMessages,
  onRecovered,
}: UsePersistedResponseRecoveryParams): PersistedResponseRecoveryState {
  const [recoveryState, setRecoveryState] =
    useState<PersistedResponseRecoveryState>("idle");
  const onRecoveredRef = useRef(onRecovered);
  onRecoveredRef.current = onRecovered;

  useEffect(() => {
    setRecoveryState("idle");
  }, [sessionId, chatId]);

  const hasAssistantResponse = hasPersistedAssistantMessage(messages);

  useEffect(() => {
    if (hasAssistantResponse) {
      setRecoveryState("idle");
      return;
    }

    if (!enabled || status !== "ready") {
      if (recoveryState === "recovering") {
        setRecoveryState("idle");
      }
      return;
    }

    if (recoveryState === "timed_out") {
      return;
    }

    let isDisposed = false;
    let isResolved = false;
    let intervalId: ReturnType<typeof setInterval> | null = null;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const stopPolling = () => {
      if (intervalId !== null) {
        clearInterval(intervalId);
      }
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
      }
    };

    const pollForPersistedMessages = async () => {
      if (isDisposed || isResolved) {
        return;
      }

      try {
        const response = await fetch(
          `/api/sessions/${sessionId}/chats/${chatId}/messages`,
          {
            cache: "no-store",
          },
        );
        if (!response.ok) {
          return;
        }

        const payload =
          (await response.json()) as PersistedChatMessagesResponse;
        if (!hasPersistedAssistantMessage(payload.messages)) {
          return;
        }

        isResolved = true;
        stopPolling();
        if (isDisposed) {
          return;
        }

        setMessages(payload.messages);
        setRecoveryState("idle");
        onRecoveredRef.current?.();
      } catch {
        // Ignore transient polling failures and try again until timeout.
      }
    };

    setRecoveryState("recovering");
    void pollForPersistedMessages();

    intervalId = setInterval(() => {
      void pollForPersistedMessages();
    }, PERSISTED_RESPONSE_RECOVERY_POLL_MS);

    timeoutId = setTimeout(() => {
      if (isDisposed || isResolved) {
        return;
      }

      isResolved = true;
      stopPolling();
      setRecoveryState("timed_out");
    }, PERSISTED_RESPONSE_RECOVERY_TIMEOUT_MS);

    return () => {
      isDisposed = true;
      stopPolling();
    };
  }, [
    chatId,
    enabled,
    hasAssistantResponse,
    recoveryState,
    sessionId,
    setMessages,
    status,
  ]);

  return recoveryState;
}
