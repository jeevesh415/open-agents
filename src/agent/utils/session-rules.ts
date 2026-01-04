import { z } from "zod";
import * as path from "path";
import { isPathWithinDirectory } from "./path";

// Rule types
const CommandPrefixRuleSchema = z.object({
  type: z.literal("command-prefix"),
  prefix: z.string(), // e.g., "bun test", "git diff"
});

const PathGlobRuleSchema = z.object({
  type: z.literal("path-glob"),
  glob: z.string(), // e.g., "src/**"
  toolTypes: z.array(z.enum(["write", "edit"])),
});

const SubagentTypeRuleSchema = z.object({
  type: z.literal("subagent-type"),
  subagentType: z.enum(["executor"]),
});

export const ApprovalRuleSchema = z.discriminatedUnion("type", [
  CommandPrefixRuleSchema,
  PathGlobRuleSchema,
  SubagentTypeRuleSchema,
]);

export const SessionRuleSchema = z.object({
  id: z.string(),
  rule: ApprovalRuleSchema,
  scope: z.object({ cwd: z.string() }),
  createdAt: z.number(),
});

export type ApprovalRule = z.infer<typeof ApprovalRuleSchema>;
export type SessionRule = z.infer<typeof SessionRuleSchema>;

/**
 * Check if a command-prefix rule matches the given command.
 * Only matches if the rule's scope cwd matches the current working directory.
 */
export function matchCommandPrefixRule(
  rule: SessionRule,
  command: string,
  cwd: string,
): boolean {
  if (rule.rule.type !== "command-prefix") return false;
  if (rule.scope.cwd !== cwd) return false;

  const prefix = rule.rule.prefix.trim();
  if (!prefix) return false;

  const trimmedCommand = command.trim();
  if (!trimmedCommand.startsWith(prefix)) return false;
  if (trimmedCommand.length === prefix.length) return true;

  const nextChar = trimmedCommand.charAt(prefix.length);
  return /\s/.test(nextChar);
}

/**
 * Check if a path-glob rule matches the given file path.
 * Only matches if:
 * - The rule's scope cwd matches the current working directory
 * - The tool type matches the rule's allowed tool types
 * - The file path matches the glob pattern
 */
export function matchPathGlobRule(
  rule: SessionRule,
  filePath: string,
  toolType: "write" | "edit",
  cwd: string,
): boolean {
  if (rule.rule.type !== "path-glob") return false;
  if (rule.scope.cwd !== cwd) return false;
  if (!rule.rule.toolTypes.includes(toolType)) return false;

  // Get relative path from cwd
  const absolutePath = path.isAbsolute(filePath)
    ? filePath
    : path.resolve(cwd, filePath);

  // File must be within cwd
  if (!isPathWithinDirectory(absolutePath, cwd)) return false;

  const relativePath = path.relative(cwd, absolutePath);
  const normalizedRelative = relativePath.split(path.sep).join("/");
  const pattern = rule.rule.glob;
  const normalizedPattern = pattern.split(path.sep).join("/");

  if (normalizedPattern === "**") return true;

  // Simple glob matching for directory-based patterns like "src/**"
  if (normalizedPattern.endsWith("/**")) {
    const prefix = normalizedPattern.slice(0, -3);
    if (!prefix) return true;
    return (
      normalizedRelative === prefix ||
      normalizedRelative.startsWith(`${prefix}/`)
    );
  }

  // Fallback: exact prefix match with path boundary
  return (
    normalizedRelative === normalizedPattern ||
    normalizedRelative.startsWith(`${normalizedPattern}/`)
  );
}

/**
 * Check if a subagent-type rule matches the given subagent type.
 * Only matches if the rule's scope cwd matches the current working directory.
 */
export function matchSubagentTypeRule(
  rule: SessionRule,
  subagentType: string,
  cwd: string,
): boolean {
  if (rule.rule.type !== "subagent-type") return false;
  if (rule.scope.cwd !== cwd) return false;

  return rule.rule.subagentType === subagentType;
}
