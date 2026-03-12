import {
  bashTool,
  editFileTool,
  readFileTool,
  writeFileTool,
} from "@open-harness/agent";
import type { Sandbox } from "@open-harness/sandbox";
import {
  gateway,
  stepCountIs,
  ToolLoopAgent,
  type LanguageModel,
  type ToolSet,
} from "ai";
import { z } from "zod";
import {
  buildSystemPrompt,
  type BuildSystemPromptOptions,
} from "./system-prompt";

const durableAgentCallOptionsSchema = z.object({
  sandbox: z.custom<Sandbox>(),
  model: z.custom<LanguageModel>().optional(),
  systemPrompt: z.custom<BuildSystemPromptOptions>().optional(),
});

export type DurableAgentCallOptions = z.infer<
  typeof durableAgentCallOptionsSchema
>;

export interface CreateDurableAgentOptions {
  model?: LanguageModel;
  stopAfterSteps?: number;
  systemPrompt?: BuildSystemPromptOptions;
}

export const defaultDurableAgentModel = gateway("anthropic/claude-haiku-4.5");

const durableAgentTools = {
  read: readFileTool(),
  write: writeFileTool(),
  edit: editFileTool(),
  bash: bashTool(),
} satisfies ToolSet;

/**
 * Create a durable agent bound to a sandbox id.
 *
 * The returned agent expects a sandbox instance in call options and injects
 * `sandboxId` into `experimental_context` so tools and telemetry can access it.
 */
export function createDurableAgent(
  sandboxId: string,
  options: CreateDurableAgentOptions = {},
) {
  return new ToolLoopAgent({
    model: options.model ?? defaultDurableAgentModel,
    instructions: buildSystemPrompt({
      selectedTools: ["read", "bash", "edit", "write"],
      ...options.systemPrompt,
    }),
    tools: durableAgentTools,
    stopWhen: stepCountIs(options.stopAfterSteps ?? 200),
    callOptionsSchema: durableAgentCallOptionsSchema,
    prepareCall: ({ options: callOptions, model, ...settings }) => {
      if (!callOptions) {
        throw new Error("Durable agent requires call options with a sandbox.");
      }

      const sandbox = callOptions.sandbox;
      const callModel = callOptions.model ?? model;
      const promptOptions: BuildSystemPromptOptions = {
        selectedTools: ["read", "bash", "edit", "write"],
        cwd: sandbox.workingDirectory,
        ...options.systemPrompt,
        ...callOptions.systemPrompt,
      };

      return {
        ...settings,
        model: callModel,
        instructions: buildSystemPrompt(promptOptions),
        experimental_context: {
          sandbox,
          sandboxId,
          approval: { type: "delegated" as const },
          model: callModel,
        },
      };
    },
  });
}
