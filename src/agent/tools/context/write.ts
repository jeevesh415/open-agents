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

export const writeFileTool = tool({
  description: `Write content to a file on the filesystem.

USAGE:
- The path must be an absolute path
- This will overwrite existing files
- Parent directories will be created if they don't exist

IMPORTANT:
- ALWAYS read a file first before overwriting it
- Prefer editing existing files over creating new ones
- NEVER create documentation files unless explicitly requested
- Do not write files containing secrets or credentials`,
  inputSchema: z.object({
    filePath: z.string().describe("Absolute path to the file to write"),
    content: z.string().describe("Content to write to the file"),
  }),
  execute: async ({ filePath, content }, { experimental_context }) => {
    const context = experimental_context as AgentContext;
    const workingDirectory = context?.workingDirectory ?? process.cwd();

    try {
      const absolutePath = path.isAbsolute(filePath)
        ? filePath
        : path.resolve(workingDirectory, filePath);

      // Security check: ensure path is within working directory
      if (!isPathWithinDirectory(absolutePath, workingDirectory)) {
        return {
          success: false,
          error: `Access denied: path "${absolutePath}" is outside the working directory "${workingDirectory}"`,
        };
      }

      const dir = path.dirname(absolutePath);
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(absolutePath, content, "utf-8");

      const stats = await fs.stat(absolutePath);

      return {
        success: true,
        path: absolutePath,
        bytesWritten: stats.size,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        error: `Failed to write file: ${message}`,
      };
    }
  },
});

export const editFileTool = tool({
  description: `Perform exact string replacement in a file.

USAGE:
- You must read the file first before editing
- old_string must match exactly (including whitespace/indentation)
- old_string must be unique in the file unless using replace_all
- Use replace_all to change all occurrences (e.g., renaming a variable)

IMPORTANT:
- Preserve exact indentation from the file
- The edit will FAIL if old_string is not unique (provide more context to make it unique)
- Never include line numbers in old_string or new_string`,
  inputSchema: z.object({
    filePath: z.string().describe("Absolute path to the file to edit"),
    oldString: z.string().describe("The exact text to replace"),
    newString: z
      .string()
      .describe("The text to replace it with (must differ from oldString)"),
    replaceAll: z
      .boolean()
      .optional()
      .describe("Replace all occurrences. Default: false"),
  }),
  execute: async ({ filePath, oldString, newString, replaceAll = false }, { experimental_context }) => {
    const context = experimental_context as AgentContext;
    const workingDirectory = context?.workingDirectory ?? process.cwd();

    try {
      if (oldString === newString) {
        return {
          success: false,
          error: "oldString and newString must be different",
        };
      }

      const absolutePath = path.isAbsolute(filePath)
        ? filePath
        : path.resolve(workingDirectory, filePath);

      // Security check: ensure path is within working directory
      if (!isPathWithinDirectory(absolutePath, workingDirectory)) {
        return {
          success: false,
          error: `Access denied: path "${absolutePath}" is outside the working directory "${workingDirectory}"`,
        };
      }

      const content = await fs.readFile(absolutePath, "utf-8");

      if (!content.includes(oldString)) {
        return {
          success: false,
          error: "oldString not found in file",
          hint: "Make sure to match exact whitespace and indentation",
        };
      }

      const occurrences = content.split(oldString).length - 1;
      if (occurrences > 1 && !replaceAll) {
        return {
          success: false,
          error: `oldString found ${occurrences} times. Use replaceAll=true or provide more context to make it unique.`,
        };
      }

      const newContent = replaceAll
        ? content.replaceAll(oldString, newString)
        : content.replace(oldString, newString);

      await fs.writeFile(absolutePath, newContent, "utf-8");

      return {
        success: true,
        path: absolutePath,
        replacements: replaceAll ? occurrences : 1,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        error: `Failed to edit file: ${message}`,
      };
    }
  },
});
