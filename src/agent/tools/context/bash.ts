import { tool } from "ai";
import { z } from "zod";
import { spawn } from "child_process";
import * as path from "path";
import type { AgentContext } from "../../types";

function isPathWithinDirectory(filePath: string, directory: string): boolean {
  const resolvedPath = path.resolve(filePath);
  const resolvedDir = path.resolve(directory);
  return resolvedPath.startsWith(resolvedDir + path.sep) || resolvedPath === resolvedDir;
}

const TIMEOUT_MS = 120_000;
const MAX_OUTPUT_LENGTH = 50_000;

interface BashResult {
  success: boolean;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  truncated: boolean;
}

async function executeCommand(
  command: string,
  cwd: string,
  timeoutMs: number
): Promise<BashResult> {
  return new Promise((resolve) => {
    const child = spawn("bash", ["-c", command], {
      cwd,
      env: { ...process.env },
      timeout: timeoutMs,
    });

    let stdout = "";
    let stderr = "";
    let truncated = false;

    child.stdout.on("data", (data) => {
      const chunk = data.toString();
      if (stdout.length + chunk.length > MAX_OUTPUT_LENGTH) {
        stdout += chunk.slice(0, MAX_OUTPUT_LENGTH - stdout.length);
        truncated = true;
      } else {
        stdout += chunk;
      }
    });

    child.stderr.on("data", (data) => {
      const chunk = data.toString();
      if (stderr.length + chunk.length > MAX_OUTPUT_LENGTH) {
        stderr += chunk.slice(0, MAX_OUTPUT_LENGTH - stderr.length);
        truncated = true;
      } else {
        stderr += chunk;
      }
    });

    child.on("close", (code) => {
      resolve({
        success: code === 0,
        exitCode: code,
        stdout,
        stderr,
        truncated,
      });
    });

    child.on("error", (error) => {
      resolve({
        success: false,
        exitCode: null,
        stdout,
        stderr: error.message,
        truncated,
      });
    });
  });
}

export const bashTool = tool({
  description: `Execute a bash command in the user's shell.

USAGE:
- Commands timeout after 2 minutes
- Output over 50000 characters is truncated
- Use cwd parameter to run in a specific directory

DO NOT USE FOR:
- File reading (use Read tool instead)
- File editing (use Edit tool instead)
- File creation (use Write tool instead)
- Searching (use Grep tool instead)

IMPORTANT:
- Never chain commands with ; or && - make separate tool calls
- Never use interactive commands (vim, nano, etc.)
- Never use background processes with &
- Always quote file paths with spaces`,
  inputSchema: z.object({
    command: z.string().describe("The bash command to execute"),
    cwd: z
      .string()
      .optional()
      .describe("Working directory for the command (absolute path)"),
  }),
  execute: async ({ command, cwd }, { experimental_context }) => {
    const context = experimental_context as AgentContext;
    const workingDirectory = context?.workingDirectory ?? process.cwd();

    // Resolve the working directory
    const workingDir = cwd
      ? (path.isAbsolute(cwd) ? cwd : path.resolve(workingDirectory, cwd))
      : workingDirectory;

    // Security check: ensure cwd is within working directory
    if (!isPathWithinDirectory(workingDir, workingDirectory)) {
      return {
        success: false,
        exitCode: null,
        stdout: "",
        stderr: `Access denied: cwd "${workingDir}" is outside the working directory "${workingDirectory}"`,
      };
    }

    const result = await executeCommand(command, workingDir, TIMEOUT_MS);

    return {
      success: result.success,
      exitCode: result.exitCode,
      stdout: result.stdout,
      stderr: result.stderr,
      ...(result.truncated && { truncated: true }),
    };
  },
});
