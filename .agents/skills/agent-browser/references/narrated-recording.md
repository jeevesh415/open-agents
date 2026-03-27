# Narrated Recording

Record browser screencasts with a synchronized voiceover script — like an engineer walking through a demo.

**Related**: [video-recording.md](video-recording.md) for demo recording techniques, [SKILL.md](../SKILL.md) for quick start.

## Contents

- [Overview](#overview)
- [Output Files](#output-files)
- [VTT Format Reference](#vtt-format-reference)
- [Workflow](#workflow)
- [Narration Guidelines](#narration-guidelines)
- [Example: Full Narrated Demo](#example-full-narrated-demo)
- [Using the VTT File](#using-the-vtt-file)

## Overview

A narrated recording produces two files side by side:

1. **A WebM screencast** — the silent video from `agent-browser record`
2. **A VTT voiceover script** — timestamped narration describing what's happening on screen

The voiceover script is written in [WebVTT](https://developer.mozilla.org/en-US/docs/Web/API/WebVTT_API) format so it can be used directly as subtitles, fed into a TTS engine for audio synthesis, or read as standalone documentation.

The key insight: the agent already knows *what* it's doing and *why* at every step. The narrated recording workflow captures that knowledge as a script synchronized to the video timeline.

## Output Files

| File | Format | Purpose |
|------|--------|---------|
| `demo.webm` | WebM video | Silent screencast of the browser session |
| `demo.vtt` | WebVTT | Timestamped voiceover script for the screencast |

The `.vtt` file is named to match the video — if the video is `./recordings/feature-demo.webm`, the script is `./recordings/feature-demo.vtt`.

## VTT Format Reference

WebVTT is the web standard for timed text. Each cue has a timestamp range and narration text:

```
WEBVTT

00:00.000 --> 00:03.500
Opening the application to show the new dashboard layout.

00:03.500 --> 00:08.000
Clicking on "New Project" in the sidebar. This is the feature
we just built — it opens the project creation form.

00:08.000 --> 00:14.000
Filling in the project name and selecting a template.
Notice the live preview updating on the right as I type.

00:14.000 --> 00:18.000
Submitting the form. The project is created and we're
redirected to the project overview page.
```

**Format rules:**
- First line must be `WEBVTT`
- Blank line between each cue
- Timestamps use `MM:SS.mmm` (or `HH:MM:SS.mmm` for longer recordings)
- Each cue's end timestamp should equal the next cue's start timestamp (no gaps)
- Keep cues to 1-3 sentences — short enough to read at subtitle pace

## Workflow

### Step-by-step pattern for agents

This is the sequence to follow when creating a narrated recording:

```bash
# 1. Initialize — capture the start time and create the VTT file
RECORDING_START=$(date +%s%3N)
VIDEO_PATH="./demo.webm"
VTT_PATH="${VIDEO_PATH%.webm}.vtt"
echo "WEBVTT" > "$VTT_PATH"

# 2. Start the video recording
agent-browser record start "$VIDEO_PATH"

# 3. Before each meaningful action, compute elapsed time and write a cue.
#    Use this helper to append cues:
narrate() {
  local now=$(date +%s%3N)
  local elapsed_ms=$(( now - RECORDING_START ))
  local secs=$(( elapsed_ms / 1000 ))
  local ms=$(( elapsed_ms % 1000 ))
  local mins=$(( secs / 60 ))
  local s=$(( secs % 60 ))
  LAST_TIMESTAMP=$(printf "%02d:%02d.%03d" $mins $s $ms)

  # If there's a pending cue, close it with the current timestamp
  if [ -n "$PENDING_CUE" ]; then
    printf "\n%s --> %s\n%s\n" "$PENDING_START" "$LAST_TIMESTAMP" "$PENDING_CUE" >> "$VTT_PATH"
  fi

  PENDING_START="$LAST_TIMESTAMP"
  PENDING_CUE="$1"
}

# 4. Use it throughout the recording:
narrate "Opening the application dashboard."
agent-browser open https://app.example.com/dashboard
agent-browser wait --load networkidle
agent-browser wait 1500  # Pause so the viewer can see the page

narrate "Clicking on the New Project button in the sidebar."
agent-browser snapshot -i
agent-browser click @e3
agent-browser wait --load networkidle
agent-browser wait 1000

narrate "Filling in the project details. The form validates in real time."
agent-browser fill @e5 "My New Project"
agent-browser wait 500
agent-browser fill @e7 "A demo project to show the new feature."
agent-browser wait 1000

narrate "Submitting the form and waiting for the redirect."
agent-browser click @e9
agent-browser wait --load networkidle
agent-browser wait 2000

# 5. Close the final cue and stop recording
narrate ""  # Flush the last pending cue
agent-browser record stop

echo "Recording saved: $VIDEO_PATH"
echo "Voiceover script saved: $VTT_PATH"
```

### Key points

- **Call `narrate` before each action group**, not after. The narration describes what's about to happen on screen.
- **Add `wait` pauses** (500–2000ms) between actions so the video isn't a blur and the narration has time to breathe.
- **Group related actions** under a single narration cue. Don't narrate every individual keystroke — narrate the *intent* (e.g., "Filling in the login form" covers both the email and password fields).
- **Flush the final cue** by calling `narrate ""` (empty string) before stopping the recording. This closes the last timestamp range.

## Narration Guidelines

The voiceover should sound like an engineer giving a casual demo to a teammate — not a formal script, not raw action logs.

### Tone

- **Conversational and direct.** "Here I'm opening the settings page" not "The agent navigates to the settings page."
- **First person.** Use "I" — you're narrating your own actions.
- **Explain the why, not just the what.** "Clicking Delete to show the confirmation dialog" is better than "Clicking the Delete button."
- **Point out what's interesting.** If something loads fast, if a layout shifted, if an animation plays — mention it.

### Content per cue

Each narration cue should include **one or two** of:

1. **What you're doing** — the action ("Opening the form", "Submitting the request")
2. **Why you're doing it** — the intent ("to show the new validation", "to verify the redirect works")
3. **What to notice** — draw attention ("Notice the toast notification", "The sidebar updates in real time")

### What to avoid

- Don't narrate mechanical details: "Moving mouse to coordinates 340, 120" — nobody cares.
- Don't read out selectors or refs: "Clicking @e5" is meaningless to a viewer.
- Don't narrate waits: "Now waiting 500 milliseconds" — just let the pause happen silently.
- Don't over-narrate: silence is fine. Not every second needs narration.

### Pacing

- **Aim for 2-5 seconds per cue.** Shorter cues feel rushed; longer ones lose attention.
- **Let important results breathe.** After a page loads or a big change happens, leave 1-2 seconds of silence before the next narration.
- **Front-load the interesting part.** Start the cue with what matters: "The chart now shows real-time data" not "After clicking the button, if we look at the chart, we can see it now shows real-time data."

## Example: Full Narrated Demo

A complete example recording a feature demo:

```bash
#!/bin/bash
set -euo pipefail

cleanup() {
  agent-browser record stop 2>/dev/null || true
  agent-browser close 2>/dev/null || true
}
trap cleanup EXIT

VIDEO_PATH="./demo-new-search.webm"
VTT_PATH="${VIDEO_PATH%.webm}.vtt"
RECORDING_START=""
PENDING_CUE=""
PENDING_START=""

init_narration() {
  RECORDING_START=$(date +%s%3N)
  echo "WEBVTT" > "$VTT_PATH"
}

narrate() {
  local now=$(date +%s%3N)
  local elapsed_ms=$(( now - RECORDING_START ))
  local secs=$(( elapsed_ms / 1000 ))
  local ms=$(( elapsed_ms % 1000 ))
  local mins=$(( secs / 60 ))
  local s=$(( secs % 60 ))
  LAST_TIMESTAMP=$(printf "%02d:%02d.%03d" $mins $s $ms)
  if [ -n "$PENDING_CUE" ]; then
    printf "\n%s --> %s\n%s\n" "$PENDING_START" "$LAST_TIMESTAMP" "$PENDING_CUE" >> "$VTT_PATH"
  fi
  PENDING_START="$LAST_TIMESTAMP"
  PENDING_CUE="$1"
}

init_narration
agent-browser record start "$VIDEO_PATH"

narrate "Here's the app homepage. I've just shipped a new search feature — let me show you how it works."
agent-browser open https://app.example.com
agent-browser wait --load networkidle
agent-browser wait 2000

narrate "Clicking into the search bar at the top. Notice it now shows recent searches as suggestions."
agent-browser snapshot -i
agent-browser click @e2
agent-browser wait 1000

narrate "Typing a query. Results appear instantly as I type — this is the new real-time search."
agent-browser type @e2 "dashboard"
agent-browser wait 1500

narrate "Selecting the first result. It takes us directly to the matching page."
agent-browser click @e4
agent-browser wait --load networkidle
agent-browser wait 2000

narrate "That's the new search feature. Real-time results, recent search suggestions, and direct navigation."
agent-browser wait 2000

narrate ""
agent-browser record stop

echo "Done: $VIDEO_PATH + $VTT_PATH"
```

## Using the VTT File

### As HTML5 subtitles

```html
<video controls width="800">
  <source src="demo.webm" type="video/webm">
  <track kind="subtitles" src="demo.vtt" srclang="en" label="Narration" default>
</video>
```

### As a narrated video with audio voiceover

Use the `narrate-audio.ts` script to synthesize real speech from the VTT cues and mux it into the video as an audio track. This uses the AI SDK with ElevenLabs for text-to-speech and ffmpeg for audio assembly.

```bash
# Requires: ELEVENLABS_API_KEY env var, ffmpeg-static package
bun .agents/skills/agent-browser/templates/narrate-audio.ts ./demo.webm
# Output: demo-narrated.webm (video with voiceover audio track)
```

The script:
1. Parses the VTT file (inferred from video filename: `demo.webm` → `demo.vtt`)
2. Calls ElevenLabs TTS for each cue via `generateSpeech` from the AI SDK
3. Assembles an audio track with each speech segment timed to its VTT timestamp
4. Muxes the audio into the video, producing `demo-narrated.webm`

Dependencies:
- `ai` and `@ai-sdk/elevenlabs` packages (already in project)
- `ffmpeg-static` package (`bun add ffmpeg-static`) — or any `ffmpeg` on PATH
- `ELEVENLABS_API_KEY` environment variable

### As standalone documentation

The VTT file is human-readable. Strip the timestamps and you have a written walkthrough of the demo:

```bash
grep -v "^[0-9]" demo.vtt | grep -v "^WEBVTT" | grep -v "^$"
```
