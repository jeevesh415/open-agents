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

interface FileInfo {
  path: string;
  isDirectory: boolean;
  size: number;
  modifiedAt: number;
}

async function findFiles(
  baseDir: string,
  pattern: string,
  limit: number
): Promise<FileInfo[]> {
  const results: FileInfo[] = [];

  const patternParts = pattern.split("/").filter(Boolean);
  const hasRecursive = pattern.includes("**");

  async function matchesPattern(filePath: string, fileName: string): Promise<boolean> {
    const lastPart = patternParts[patternParts.length - 1] ?? "*";

    if (lastPart === "*") return true;

    if (lastPart.startsWith("*.")) {
      const ext = lastPart.slice(1);
      return fileName.endsWith(ext);
    }

    if (lastPart.includes("*")) {
      const regex = new RegExp(
        "^" + lastPart.replace(/\*/g, ".*").replace(/\?/g, ".") + "$"
      );
      return regex.test(fileName);
    }

    return fileName === lastPart;
  }

  async function walk(currentDir: string, depth: number = 0) {
    if (results.length >= limit) return;

    try {
      const entries = await fs.readdir(currentDir, { withFileTypes: true });

      for (const entry of entries) {
        if (results.length >= limit) break;

        if (entry.name.startsWith(".") || entry.name === "node_modules") {
          continue;
        }

        const fullPath = path.join(currentDir, entry.name);

        if (entry.isDirectory()) {
          if (hasRecursive || depth < patternParts.length - 1) {
            await walk(fullPath, depth + 1);
          }
        } else {
          const matches = await matchesPattern(fullPath, entry.name);
          if (matches) {
            try {
              const stats = await fs.stat(fullPath);
              results.push({
                path: fullPath,
                isDirectory: false,
                size: stats.size,
                modifiedAt: stats.mtimeMs,
              });
            } catch {
              // Skip files we can't stat
            }
          }
        }
      }
    } catch {
      // Skip directories we can't read
    }
  }

  await walk(baseDir);

  results.sort((a, b) => b.modifiedAt - a.modifiedAt);

  return results;
}

export const globTool = tool({
  description: `Find files matching a glob pattern.

USAGE:
- Supports patterns like "**/*.ts", "src/**/*.js", "*.json"
- Returns files sorted by modification time (newest first)
- Skips hidden files and node_modules

EXAMPLES:
- "**/*.ts" - All TypeScript files
- "src/**/*.test.ts" - All test files under src
- "*.json" - JSON files in current directory`,
  inputSchema: z.object({
    pattern: z.string().describe("Glob pattern to match (e.g., '**/*.ts')"),
    path: z
      .string()
      .optional()
      .describe("Base directory to search from (absolute path)"),
    limit: z
      .number()
      .optional()
      .describe("Maximum number of results. Default: 100"),
  }),
  execute: async ({ pattern, path: basePath, limit = 100 }, { experimental_context }) => {
    const context = experimental_context as AgentContext;
    const workingDirectory = context?.workingDirectory ?? process.cwd();

    try {
      // Resolve search directory relative to working directory
      let searchDir: string;
      if (basePath) {
        searchDir = path.isAbsolute(basePath)
          ? basePath
          : path.resolve(workingDirectory, basePath);
      } else {
        searchDir = workingDirectory;
      }

      // Security check: ensure search directory is within working directory
      if (!isPathWithinDirectory(searchDir, workingDirectory)) {
        return {
          success: false,
          error: `Access denied: path "${searchDir}" is outside the working directory "${workingDirectory}"`,
        };
      }

      const files = await findFiles(searchDir, pattern, limit);

      return {
        success: true,
        pattern,
        baseDir: searchDir,
        count: files.length,
        files: files.map((f) => ({
          path: f.path,
          size: f.size,
          modifiedAt: new Date(f.modifiedAt).toISOString(),
        })),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        error: `Glob failed: ${message}`,
      };
    }
  },
});
