// Subtitle parsing / serialising. Deliberately forgiving: real-world subtitle
// files are messy, and a parser that throws means a user sees nothing.

export interface Cue {
  timing: string
  text: string
}

export function parseSrt(text: string): Cue[] {
  const cleaned = text
    .replace(/^﻿/, "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")

  const cues: Cue[] = []
  for (const block of cleaned.split(/\n{2,}/)) {
    const lines = block.split("\n").filter((l) => l.trim() !== "")
    if (!lines.length) continue
    let i = 0
    if (/^\d+$/.test(lines[0].trim())) i = 1
    const timing = lines[i]
    if (!timing || !timing.includes("-->")) continue
    const body = lines.slice(i + 1).join(" ").trim()
    if (body) cues.push({ timing: timing.trim(), text: body })
  }
  return cues
}

export function buildSrt(cues: Cue[]): string {
  return cues.map((c, i) => `${i + 1}\n${c.timing}\n${c.text}`).join("\n\n") + "\n"
}

// Strip markup so the translator sees clean prose.
export function stripTags(s: string): string {
  return s
    .replace(/<[^>]+>/g, "")
    .replace(/\{\\[^}]+\}/g, "")
    .replace(/\s+/g, " ")
    .trim()
}

// Many Arabic subtitles are legacy windows-1256. Detect mojibake and re-decode.
export function decodeSubtitle(bytes: Uint8Array): string {
  const utf8 = new TextDecoder("utf-8", { fatal: false }).decode(bytes)
  const replacementChars = (utf8.match(/�/g) || []).length
  const arabicChars = (utf8.match(/[؀-ۿ]/g) || []).length

  if (replacementChars > 5 && replacementChars > arabicChars / 10) {
    try {
      const alt = new TextDecoder("windows-1256").decode(bytes)
      const altArabic = (alt.match(/[؀-ۿ]/g) || []).length
      if (altArabic > arabicChars) return alt
    } catch {
      /* fall through to utf-8 */
    }
  }
  return utf8
}
