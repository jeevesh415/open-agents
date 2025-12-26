import { tool } from "ai";
import { z } from "zod";
import * as fs from "fs/promises";
import * as path from "path";
import type { AgentContext } from "../../types";

function isPathWithinDirectory(filePath: string, directory: string): boolean {
  const resolvedPath = path.resolve(filePath);
  const resolvedDir = path.resolve(directory);
  return resolvedPath.startsWith(resolvedDir + path.sep) || resolvedPath === resolvedDir;
}

export const readFileTool = tool({
  description: `Read a file from the filesystem or scratchpad.

USAGE:
- The path must be a FULL absolute path (e.g., /Users/username/project/file.ts), not just /file.ts
- Paths starting with /scratchpad/ access the scratchpad
- By default reads up to 2000 lines from the beginning
- Use offset and limit for long files
- Results include line numbers starting at 1

IMPORTANT:
- Always read a file before editing it
- You can call multiple Read tools in parallel to speculatively read multiple files
- For directories, use the glob or bash ls command instead`,
  inputSchema: z.object({
    filePath: z
      .string()
      .describe(
        "Full absolute path to the file (e.g., /Users/username/project/file.ts)",
      ),
    offset: z
      .number()
      .optional()
      .describe("Line number to start reading from (1-indexed)"),
    limit: z
      .number()
      .optional()
      .describe("Maximum number of lines to read. Default: 2000"),
  }),
  execute: async ({ filePath, offset = 1, limit = 2000 }, { experimental_context }) => {
    const context = experimental_context as AgentContext;
    const workingDirectory = context?.workingDirectory ?? process.cwd();

    try {
      if (filePath.startsWith("/scratchpad/")) {
        return {
          success: false,
          error: "Scratchpad reads are handled via agent state injection",
          hint: "The scratchpad content is available in the system context",
        };
      }

      // Resolve the path relative to working directory
      let absolutePath: string;
      if (path.isAbsolute(filePath)) {
        absolutePath = filePath;
      } else {
        absolutePath = path.resolve(workingDirectory, filePath);
      }

      // If the path doesn't exist and looks like a root-relative path (e.g., /README.md),
      // try resolving it relative to the working directory
      try {
        await fs.access(absolutePath);
      } catch {
        // Path doesn't exist - check if it's a root-relative path that should be workspace-relative
        if (
          filePath.startsWith("/") &&
          !filePath.startsWith("/Users/") &&
          !filePath.startsWith("/home/")
        ) {
          const workspaceRelativePath = path.join(workingDirectory, filePath);
          try {
            await fs.access(workspaceRelativePath);
            absolutePath = workspaceRelativePath;
          } catch {
            // Neither path exists - let it fall through to the original error handling
          }
        }
      }

      // Security check: ensure path is within working directory
      if (!isPathWithinDirectory(absolutePath, workingDirectory)) {
        return {
          success: false,
          error: `Access denied: path "${absolutePath}" is outside the working directory "${workingDirectory}"`,
        };
      }

      const stats = await fs.stat(absolutePath);
      if (stats.isDirectory()) {
        return {
          success: false,
          error: "Cannot read a directory. Use glob or ls command instead.",
        };
      }

      const content = await fs.readFile(absolutePath, "utf-8");
      const lines = content.split("\n");
      const startLine = Math.max(1, offset) - 1;
      const endLine = Math.min(lines.length, startLine + limit);
      const selectedLines = lines.slice(startLine, endLine);

      const numberedLines = selectedLines.map(
        (line, i) => `${startLine + i + 1}: ${line}`,
      );

      return {
        success: true,
        path: absolutePath,
        totalLines: lines.length,
        startLine: startLine + 1,
        endLine,
        content: numberedLines.join("\n"),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        error: `Failed to read file: ${message}`,
      };
    }
  },
});
