// The endpoint Stremio calls to list subtitles.
//
// Returns real Arabic subtitles first, ranked by popularity, and always
// appends an AI auto-translated option so that every title has Arabic
// available — including ones nobody has ever subtitled in Arabic.

import { parseId, getArabicSubtitles, getBestEnglishUrl } from "@/lib/sources"

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "*",
}

const MAX_RESULTS = 40

export const maxDuration = 30
export const dynamic = "force-dynamic"

interface StremioSubtitle {
  id: string
  url: string
  lang: string
}

export async function GET(request: Request, context: { params: Promise<{ args: string[] }> }) {
  const { args } = await context.params
  const segments = Array.isArray(args) ? args : []

  // /subtitles/movie/tt1074638.json
  // /subtitles/series/tt0944947:1:1.json
  // /subtitles/movie/tt1074638/videoHash=abc.json
  const rawId = decodeURIComponent(segments[1] || "").replace(/\.json$/i, "")
  const origin = new URL(request.url).origin

  let subtitles: StremioSubtitle[] = []

  try {
    const parsed = parseId(rawId)
    if (parsed) {
      // Arabic search and the English fallback candidate are fetched together
      // so the auto-translate option costs no extra latency.
      const [found, english] = await Promise.all([
        getArabicSubtitles(parsed),
        getBestEnglishUrl(parsed),
      ])

      subtitles = found.slice(0, MAX_RESULTS).map((item) => ({
        id: item.key,
        // SubSource items carry a relative proxy path; make it absolute.
        url: item.url.startsWith("/") ? `${origin}${item.url}` : item.url,
        lang: "ara",
      }))

      // Auto-translated fallback, always offered. A title with zero Arabic
      // subtitles still gets something, and users stuck with a badly-synced
      // real subtitle have an alternative. Clearly labelled as machine work.
      if (english) {
        subtitles.push({
          id: `ai-${parsed.imdb}-${parsed.season ?? 0}-${parsed.episode ?? 0}`,
          url: `${origin}/api/sub?t=${Buffer.from(english, "utf-8").toString("base64url")}`,
          lang: "🤖 عربي (ترجمة آلية)",
        })
      }
    }
  } catch {
    subtitles = []
  }

  // Cache successes hard — a thousand daily users hit the same popular titles.
  // NEVER cache an empty result: caching emptiness is what took the addon down.
  const cacheControl = subtitles.length
    ? "public, max-age=3600, s-maxage=21600, stale-while-revalidate=86400"
    : "no-store"

  return new Response(
    JSON.stringify({
      subtitles,
      ...(subtitles.length ? { cacheMaxAge: 21600, staleRevalidate: 86400 } : {}),
    }),
    {
      status: 200,
      headers: {
        ...CORS,
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": cacheControl,
      },
    },
  )
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS })
}
