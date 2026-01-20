import type { InferAgentUIMessage } from "ai";
import type { explorerSubagent } from "./explorer";

export type SubagentMessageMetadata = {
  inputTokens?: number;
};

// Both subagents have compatible tools, so one type works
export type SubagentUIMessage = InferAgentUIMessage<
  typeof explorerSubagent,
  SubagentMessageMetadata
>;
