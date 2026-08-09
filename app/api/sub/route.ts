// Subtitle file delivery.
//
//   ?s=<base64url subsource link>  -> fetch from SubSource, unzip, re-encode
//   ?t=<base64url english sub url> -> fetch English subtitle, translate to Arabic
//
// Both paths always return a valid .srt with UTF-8 text.

import { unzipSync } from "fflate"
import { decodeSubtitle } from "@/lib/srt"
import { translateSrtToArabic } from "@/lib/translate"

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "*",
}

const SUB_EXTENSIONS = [".srt", ".vtt", ".ass", ".ssa"]
const MAX_BYTES = 8 * 1024 * 1024

export const maxDuration = 60
export const dynamic = "force-dynamic"

function fail(message: string, status: number) {
  return new Response(message, {
    status,
    headers: { ...CORS, "Cache-Control": "no-store" },
  })
}

function srtResponse(body: string, cacheable: boolean) {
  return new Response(body, {
    status: 200,
    headers: {
      ...CORS,
      "Content-Type": "text/srt; charset=utf-8",
      "Cache-Control": cacheable
        ? "public, max-age=86400, s-maxage=604800, stale-while-revalidate=604800"
        : "no-store",
    },
  })
}

function decodeParam(value: string): string | null {
  try {
    const out = Buffer.from(value, "base64url").toString("utf-8").trim()
    return out || null
  } catch {
    return null
  }
}

async function fetchBytes(url: string, timeoutMs: number): Promise<Uint8Array | null> {
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), timeoutMs)
  try {
    const r = await fetch(url, {
      signal: ctl.signal,
      redirect: "follow",
      headers: { "User-Agent": BROWSER_UA },
    })
    if (!r.ok) return null
    const buf = new Uint8Array(await r.arrayBuffer())
    return buf.length && buf.length <= MAX_BYTES ? buf : null
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

// SubSource serves a zip; pull the first subtitle file out of it.
function extractFromZip(bytes: Uint8Array): Uint8Array | null {
  try {
    const files = unzipSync(bytes)
    const names = Object.keys(files)
    const pick =
      names.find((n) => SUB_EXTENSIONS.some((e) => n.toLowerCase().endsWith(e))) || names[0]
    return pick ? files[pick] : null
  } catch {
    return null
  }
}

async function handleSubSource(link: string): Promise<Response> {
  if (!/^[a-z0-9][a-z0-9._/-]*$/i.test(link) || link.includes("..")) {
    return fail("Bad reference", 400)
  }

  const detail = (await (async () => {
    const bytes = await fetchBytes(`https://api.subsource.net/v1/subtitle/${link}`, 9000)
    if (!bytes) return null
    try {
      return JSON.parse(new TextDecoder().decode(bytes))
    } catch {
      return null
    }
  })()) as { subtitle?: { download_token?: string } } | null

  const token = detail?.subtitle?.download_token
  if (!token) return fail("Subtitle unavailable", 502)

  const zip = await fetchBytes(`https://api.subsource.net/v1/subtitle/download/${token}`, 15000)
  if (!zip) return fail("Download failed", 502)

  const raw = extractFromZip(zip)
  if (!raw) return fail("Could not read subtitle archive", 502)

  return srtResponse(decodeSubtitle(raw), true)
}

async function handleTranslate(url: string): Promise<Response> {
  if (!/^https:\/\//i.test(url)) return fail("Bad reference", 400)

  const bytes = await fetchBytes(url, 15000)
  if (!bytes) return fail("Source subtitle unavailable", 502)

  const english = decodeSubtitle(bytes)
  const arabic = await translateSrtToArabic(english)
  if (!arabic) return fail("Translation failed", 502)

  return srtResponse(arabic, true)
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams

  const subsource = params.get("s")
  if (subsource) {
    const link = decodeParam(subsource)
    if (!link) return fail("Bad reference", 400)
    try {
      return await handleSubSource(link)
    } catch {
      return fail("Subtitle unavailable", 502)
    }
  }

  const translate = params.get("t")
  if (translate) {
    const url = decodeParam(translate)
    if (!url) return fail("Bad reference", 400)
    try {
      return await handleTranslate(url)
    } catch {
      return fail("Translation failed", 502)
    }
  }

  return fail("Missing reference", 400)
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS })
}
