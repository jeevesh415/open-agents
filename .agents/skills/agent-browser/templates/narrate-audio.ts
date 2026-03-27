#!/usr/bin/env bun
/**
 * narrate-audio.ts — Synthesize voiceover audio from a VTT script and mux it into a WebM video.
 *
 * Usage:
 *   bun narrate-audio.ts <video.webm> [<script.vtt>]
 *
 * If no VTT path is given, it's inferred from the video filename (demo.webm → demo.vtt).
 *
 * Requires:
 *   - ELEVENLABS_API_KEY env var
 *   - ai and @ai-sdk/elevenlabs packages (already in project dependencies)
 *   - ffmpeg-static package (installed automatically if missing)
 *
 * Output:
 *   - <video>-narrated.webm — the original video with voiceover audio track
 */

import { execSync, execFileSync } from "child_process";
import { existsSync, mkdirSync, writeFileSync, readFileSync, unlinkSync, readdirSync } from "fs";
import { join, dirname, basename } from "path";

// ---------------------------------------------------------------------------
// 1. Parse args
// ---------------------------------------------------------------------------

const videoPath = process.argv[2];
if (!videoPath) {
  console.error("Usage: bun narrate-audio.ts <video.webm> [<script.vtt>]");
  process.exit(1);
}

const vttPath = process.argv[3] ?? videoPath.replace(/\.webm$/, ".vtt");

if (!existsSync(videoPath)) {
  console.error(`Video not found: ${videoPath}`);
  process.exit(1);
}
if (!existsSync(vttPath)) {
  console.error(`VTT not found: ${vttPath}`);
  process.exit(1);
}

if (!process.env.ELEVENLABS_API_KEY) {
  console.error("ELEVENLABS_API_KEY environment variable is required");
  process.exit(1);
}

// ---------------------------------------------------------------------------
// 2. Resolve ffmpeg binary
// ---------------------------------------------------------------------------

function resolveFFmpeg(): string {
  // Check if ffmpeg is on PATH
  try {
    execSync("which ffmpeg", { stdio: "pipe" });
    return "ffmpeg";
  } catch {
    // not on PATH
  }

  // Check for ffmpeg-static in common locations
  const candidates = [
    join(process.cwd(), "node_modules", "ffmpeg-static", "ffmpeg"),
    join(dirname(process.argv[1]), "node_modules", "ffmpeg-static", "ffmpeg"),
    "/tmp/ffmpeg-test/node_modules/ffmpeg-static/ffmpeg",
  ];

  for (const c of candidates) {
    if (existsSync(c)) return c;
  }

  // Try to install it
  console.log("Installing ffmpeg-static...");
  try {
    execSync("bun add ffmpeg-static", { cwd: process.cwd(), stdio: "pipe" });
    const installed = join(process.cwd(), "node_modules", "ffmpeg-static", "ffmpeg");
    if (existsSync(installed)) return installed;
  } catch {
    // fall through
  }

  console.error(
    "ffmpeg not found. Install it with: bun add ffmpeg-static"
  );
  process.exit(1);
}

const FFMPEG = resolveFFmpeg();
console.log(`Using ffmpeg: ${FFMPEG}`);

// ---------------------------------------------------------------------------
// 3. Parse VTT
// ---------------------------------------------------------------------------

interface VTTCue {
  index: number;
  startMs: number;
  endMs: number;
  text: string;
}

function parseTimestamp(ts: string): number {
  // Supports MM:SS.mmm and HH:MM:SS.mmm
  const parts = ts.split(":");
  let hours = 0, minutes = 0, secAndMs: string;

  if (parts.length === 3) {
    hours = parseInt(parts[0], 10);
    minutes = parseInt(parts[1], 10);
    secAndMs = parts[2];
  } else if (parts.length === 2) {
    minutes = parseInt(parts[0], 10);
    secAndMs = parts[1];
  } else {
    throw new Error(`Invalid timestamp: ${ts}`);
  }

  const [secStr, msStr] = secAndMs.split(".");
  const seconds = parseInt(secStr, 10);
  const ms = parseInt((msStr ?? "0").padEnd(3, "0").slice(0, 3), 10);

  return (hours * 3600 + minutes * 60 + seconds) * 1000 + ms;
}

function parseVTT(content: string): VTTCue[] {
  const lines = content.split("\n");
  const cues: VTTCue[] = [];
  let i = 0;

  // Skip WEBVTT header
  while (i < lines.length && !lines[i].includes("-->")) {
    i++;
  }

  let cueIndex = 0;
  while (i < lines.length) {
    const line = lines[i].trim();

    if (line.includes("-->")) {
      const [startStr, endStr] = line.split("-->").map((s) => s.trim());
      const startMs = parseTimestamp(startStr);
      const endMs = parseTimestamp(endStr);

      // Collect text lines until empty line or end
      i++;
      const textLines: string[] = [];
      while (i < lines.length && lines[i].trim() !== "") {
        textLines.push(lines[i].trim());
        i++;
      }

      const text = textLines.join(" ");
      if (text) {
        cues.push({ index: cueIndex++, startMs, endMs, text });
      }
    } else {
      i++;
    }
  }

  return cues;
}

// ---------------------------------------------------------------------------
// 4. TTS via AI SDK + ElevenLabs
// ---------------------------------------------------------------------------

async function synthesizeCue(cue: VTTCue, outputPath: string): Promise<void> {
  // Dynamic import so the script can resolve from the project's node_modules
  const { experimental_generateSpeech: generateSpeech } = await import("ai");
  const { elevenlabs } = await import("@ai-sdk/elevenlabs");

  const result = await generateSpeech({
    model: elevenlabs.speech("eleven_turbo_v2_5"),
    text: cue.text,
  });

  // result.audio is a GeneratedAudioFile with base64 data
  const audioData =
    typeof result.audio.base64 === "string"
      ? Buffer.from(result.audio.base64, "base64")
      : result.audio.uint8Array;

  writeFileSync(outputPath, audioData);
}

// ---------------------------------------------------------------------------
// 5. Assemble audio track with ffmpeg
// ---------------------------------------------------------------------------

function getAudioDuration(ffmpeg: string, filePath: string): number {
  const out = execFileSync(ffmpeg, [
    "-i", filePath,
    "-f", "null", "-",
  ], { stdio: ["pipe", "pipe", "pipe"] });

  // ffmpeg prints duration to stderr
  const stderr = out.toString();
  // Also try ffprobe-style approach
  try {
    const probe = execFileSync(ffmpeg, [
      "-i", filePath,
      "-show_entries", "format=duration",
      "-v", "quiet",
      "-of", "csv=p=0",
    ], { stdio: ["pipe", "pipe", "pipe"] });
    const dur = parseFloat(probe.toString().trim());
    if (!isNaN(dur)) return dur * 1000;
  } catch {
    // fall through
  }

  return 0;
}

function getAudioDurationMs(ffmpeg: string, filePath: string): number {
  // Use ffmpeg to get duration by reading the file
  try {
    const result = execFileSync(ffmpeg, [
      "-i", filePath,
      "-f", "null",
      "-"
    ], { stdio: ["pipe", "pipe", "pipe"], encoding: "utf-8" } as any);

    // Duration is in stderr for ffmpeg
    const stderr = (result as any).toString?.() || "";
    const match = stderr.match(/Duration:\s*(\d+):(\d+):(\d+)\.(\d+)/);
    if (match) {
      const h = parseInt(match[1], 10);
      const m = parseInt(match[2], 10);
      const s = parseInt(match[3], 10);
      const cs = parseInt(match[4], 10);
      return (h * 3600 + m * 60 + s) * 1000 + cs * 10;
    }
  } catch (e: any) {
    // ffmpeg exits non-zero when outputting to null, but still prints info to stderr
    const stderr = e.stderr?.toString() || "";
    const match = stderr.match(/Duration:\s*(\d+):(\d+):(\d+)\.(\d+)/);
    if (match) {
      const h = parseInt(match[1], 10);
      const m = parseInt(match[2], 10);
      const s = parseInt(match[3], 10);
      const cs = parseInt(match[4], 10);
      return (h * 3600 + m * 60 + s) * 1000 + cs * 10;
    }
  }
  // Fallback: estimate ~150 words/min
  return 3000;
}

function assembleAudioTrack(
  ffmpeg: string,
  cues: VTTCue[],
  audioFiles: string[],
  outputPath: string,
  videoDurationMs: number
): void {
  // Build an ffmpeg filter that places each audio segment at its cue start time,
  // then mixes them all together.
  //
  // Strategy: for each cue, create a silence-padded version using adelay,
  // then amix all streams together.

  if (cues.length === 0) {
    console.error("No cues to assemble");
    process.exit(1);
  }

  const inputs: string[] = [];
  const filterParts: string[] = [];

  for (let i = 0; i < cues.length; i++) {
    inputs.push("-i", audioFiles[i]);
    const delayMs = cues[i].startMs;
    // adelay delays the audio by the specified milliseconds
    filterParts.push(`[${i}]adelay=${delayMs}|${delayMs}[d${i}]`);
  }

  // Mix all delayed streams
  const mixInputs = cues.map((_, i) => `[d${i}]`).join("");
  filterParts.push(
    `${mixInputs}amix=inputs=${cues.length}:duration=longest:dropout_transition=0[out]`
  );

  const filterComplex = filterParts.join(";");

  execFileSync(ffmpeg, [
    ...inputs,
    "-filter_complex", filterComplex,
    "-map", "[out]",
    "-ac", "1",
    "-ar", "44100",
    "-y",
    outputPath,
  ], { stdio: ["pipe", "pipe", "pipe"] });
}

// ---------------------------------------------------------------------------
// 6. Mux audio into video
// ---------------------------------------------------------------------------

function muxAudioVideo(
  ffmpeg: string,
  videoPath: string,
  audioPath: string,
  outputPath: string
): void {
  execFileSync(ffmpeg, [
    "-i", videoPath,
    "-i", audioPath,
    "-c:v", "copy",
    "-c:a", "libopus",
    "-b:a", "128k",
    "-shortest",
    "-y",
    outputPath,
  ], { stdio: ["pipe", "pipe", "pipe"] });
}

// ---------------------------------------------------------------------------
// 7. Main
// ---------------------------------------------------------------------------

async function main() {
  console.log(`Video: ${videoPath}`);
  console.log(`VTT:   ${vttPath}`);

  // Parse VTT
  const vttContent = readFileSync(vttPath, "utf-8");
  const cues = parseVTT(vttContent);
  console.log(`Parsed ${cues.length} cues from VTT`);

  if (cues.length === 0) {
    console.error("No cues found in VTT file");
    process.exit(1);
  }

  for (const cue of cues) {
    console.log(`  [${(cue.startMs / 1000).toFixed(1)}s - ${(cue.endMs / 1000).toFixed(1)}s] ${cue.text.slice(0, 60)}...`);
  }

  // Create temp directory
  const tmpDir = join(dirname(videoPath), ".narrate-tmp");
  mkdirSync(tmpDir, { recursive: true });

  try {
    // Synthesize speech for each cue
    console.log("\nSynthesizing speech...");
    const audioFiles: string[] = [];

    for (const cue of cues) {
      const audioFile = join(tmpDir, `cue_${String(cue.index).padStart(3, "0")}.mp3`);
      process.stdout.write(`  Cue ${cue.index + 1}/${cues.length}: "${cue.text.slice(0, 50)}..." `);
      await synthesizeCue(cue, audioFile);
      console.log("✓");
      audioFiles.push(audioFile);
    }

    // Get video duration
    const videoDurationMs = getAudioDurationMs(FFMPEG, videoPath);
    console.log(`\nVideo duration: ${(videoDurationMs / 1000).toFixed(1)}s`);

    // Assemble audio track
    console.log("Assembling audio track...");
    const assembledAudio = join(tmpDir, "voiceover.mp3");
    assembleAudioTrack(FFMPEG, cues, audioFiles, assembledAudio, videoDurationMs);
    console.log("Audio track assembled ✓");

    // Mux into video
    const outputPath = videoPath.replace(/\.webm$/, "-narrated.webm");
    console.log(`Muxing audio into video → ${outputPath}`);
    muxAudioVideo(FFMPEG, videoPath, assembledAudio, outputPath);
    console.log(`\n✓ Done: ${outputPath}`);

  } finally {
    // Clean up temp files
    try {
      const files = readdirSync(tmpDir);
      for (const f of files) unlinkSync(join(tmpDir, f));
      execSync(`rmdir "${tmpDir}"`, { stdio: "pipe" });
    } catch {
      // best effort cleanup
    }
  }
}

main().catch((e) => {
  console.error("Error:", e.message || e);
  process.exit(1);
});
