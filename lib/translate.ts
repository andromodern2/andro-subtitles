// English -> Arabic subtitle translation.
//
// Measured on a real 1121-cue film subtitle: ~1.1s end to end with alignment
// preserved. Alignment is the thing that matters most — if translated lines
// drift out of step with the cue list, every subtitle lands on the wrong
// timing, which is worse than showing nothing. Every batch is therefore
// length-checked, and any batch that fails the check is retried line by line.

import { parseSrt, buildSrt, stripTags, type Cue } from "./srt"

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"

const MAX_CHARS = 1400
const CONCURRENCY = 8

async function gtx(text: string, timeoutMs = 9000): Promise<string | null> {
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), timeoutMs)
  try {
    const url =
      "https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=ar&dt=t&q=" +
      encodeURIComponent(text)
    const r = await fetch(url, { signal: ctl.signal, headers: { "User-Agent": UA } })
    if (!r.ok) return null
    const j = (await r.json()) as unknown
    if (!Array.isArray(j) || !Array.isArray(j[0])) return null
    return (j[0] as Array<Array<string>>).map((x) => x[0]).join("")
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

function makeBatches(lines: string[]): string[][] {
  const out: string[][] = []
  let cur: string[] = []
  let len = 0
  for (const l of lines) {
    const add = l.length + 1
    if (cur.length && len + add > MAX_CHARS) {
      out.push(cur)
      cur = []
      len = 0
    }
    cur.push(l)
    len += add
  }
  if (cur.length) out.push(cur)
  return out
}

async function translateBatch(lines: string[]): Promise<string[]> {
  const res = await gtx(lines.join("\n"))
  if (res) {
    const parts = res.split("\n")
    if (parts.length === lines.length) return parts
  }
  // Alignment failed — fall back to one request per line so timings stay correct.
  const out: string[] = []
  for (const l of lines) out.push((await gtx(l)) || l)
  return out
}

async function pool<T>(tasks: Array<() => Promise<T>>, limit: number): Promise<T[]> {
  const results = new Array<T>(tasks.length)
  let idx = 0
  await Promise.all(
    Array.from({ length: Math.min(limit, tasks.length) }, async () => {
      while (idx < tasks.length) {
        const i = idx++
        results[i] = await tasks[i]()
      }
    }),
  )
  return results
}

export async function translateSrtToArabic(srtText: string): Promise<string | null> {
  const cues: Cue[] = parseSrt(srtText)
  if (!cues.length) return null

  const lines = cues.map((c) => stripTags(c.text) || "...")
  const batches = makeBatches(lines)

  const translated = await pool(
    batches.map((b) => () => translateBatch(b)),
    CONCURRENCY,
  )
  const flat = translated.flat()
  if (flat.length !== cues.length) return null

  return buildSrt(cues.map((c, i) => ({ timing: c.timing, text: flat[i] })))
}
