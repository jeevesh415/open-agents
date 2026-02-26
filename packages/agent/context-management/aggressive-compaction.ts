import {
  pruneMessages,
  type ModelMessage,
  type StepResult,
  type ToolSet,
} from "ai";

export interface AggressiveCompactionOptions<T extends ToolSet> {
  messages: ModelMessage[];
  steps: StepResult<T>[];
  tokenThreshold?: number;
  minTrimSavings?: number;
}

/**
 * Aggressive single-strategy compaction.
 *
 * If input tokens exceed tokenThreshold and removable tool content is at least
 * minTrimSavings, all tool-call/tool-result parts are omitted.
 */
export function aggressiveCompactContext<T extends ToolSet>({
  messages,
  steps,
  tokenThreshold = 40_000,
  minTrimSavings = 20_000,
}: AggressiveCompactionOptions<T>): ModelMessage[] {
  if (messages.length === 0) return messages;

  const currentTokens = getCurrentTokenUsage(steps);
  if (currentTokens <= tokenThreshold) {
    return messages;
  }

  const removableToolTokens = estimateToolTokens(messages);
  if (removableToolTokens < minTrimSavings) {
    return messages;
  }

  return pruneMessages({
    messages,
    toolCalls: "all",
    emptyMessages: "remove",
  });
}

function getCurrentTokenUsage<T extends ToolSet>(
  steps: StepResult<T>[],
): number {
  if (steps.length === 0) return 0;
  const lastStep = steps[steps.length - 1];
  if (!lastStep) return 0;
  return lastStep.usage?.inputTokens ?? 0;
}

function estimateToolTokens(messages: ModelMessage[]): number {
  let toolChars = 0;

  for (const message of messages) {
    if (!message || !Array.isArray(message.content)) {
      continue;
    }

    for (const part of message.content) {
      if (part.type === "tool-call" || part.type === "tool-result") {
        toolChars += JSON.stringify(part).length;
      }
    }
  }

  return Math.ceil(toolChars / 4);
}
