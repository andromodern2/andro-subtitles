// Subtitle sources.
//
// Design rule: every source is independent and failure-isolated. They run in
// parallel through Promise.allSettled with their own timeouts, so one provider
// being slow, rate-limited or entirely down can never blank the result list.
// That single property is what turns this from "usually works" into
// "works for everyone".

const ADDON_UA = "ANDRO Stremio Addon v2.0.0 (+https://androsubs.vercel.app)"
const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"

// Stremio's UTF-8 gateway: give it an OpenSubtitles file id and it returns a
// ready, correctly-encoded .srt. Saves us proxying and re-encoding entirely.
export const UTF8_GATEWAY =
  "https://subs5.strem.io/en/download/subencoding-stremio-utf8/src-api/file/"

const ARABIC = new Set(["ara", "ar", "arb"])

export interface ParsedId {
  imdb: string
  numeric: string
  season?: number
  episode?: number
}

export interface SubtitleItem {
  key: string
  url: string
  name: string
  downloads: number
  source: "opensubtitles" | "stremio" | "subsource"
}

export function parseId(rawId: string): ParsedId | null {
  const m = String(rawId || "").trim().match(/^(tt\d+)(?::(\d+):(\d+))?$/i)
  if (!m) return null
  const imdb = m[1].toLowerCase()
  return {
    imdb,
    // Leading zeros are significant. tt0944947 -> "0944947".
    numeric: imdb.replace(/^tt/, ""),
    season: m[2] ? Number(m[2]) : undefined,
    episode: m[3] ? Number(m[3]) : undefined,
  }
}

async function getJson(url: string, timeoutMs: number, ua = ADDON_UA): Promise<unknown> {
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), timeoutMs)
  try {
    const r = await fetch(url, {
      signal: ctl.signal,
      redirect: "follow",
      cache: "no-store",
      headers: { "User-Agent": ua, Accept: "application/json, text/plain, */*" },
    })
    if (!r.ok) return null
    const text = await r.text()
    // Bot-protection pages arrive as HTML; reject before parsing.
    if (!text || (text[0] !== "[" && text[0] !== "{")) return null
    return JSON.parse(text)
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

/* ---------------- Source 1: OpenSubtitles legacy REST ---------------- */

async function fromOpenSubtitles(p: ParsedId, lang: "ara" | "eng"): Promise<SubtitleItem[]> {
  // Path segments MUST be alphabetical or the API redirects to an empty body.
  const parts: string[] = []
  if (p.episode !== undefined) parts.push(`episode-${p.episode}`)
  parts.push(`imdbid-${p.numeric}`)
  if (p.season !== undefined) parts.push(`season-${p.season}`)
  parts.push(`sublanguageid-${lang}`)

  const rows = await getJson(`https://rest.opensubtitles.org/search/${parts.join("/")}`, 8000)
  if (!Array.isArray(rows)) return []

  return rows
    .filter((r) => r && String(r.SubLanguageID || "").toLowerCase() === lang)
    .filter((r) => /^\d+$/.test(String(r.IDSubtitleFile || "")))
    .map((r) => ({
      key: `os-${r.IDSubtitleFile}`,
      url: `${UTF8_GATEWAY}${r.IDSubtitleFile}`,
      name: String(r.SubFileName || "Arabic"),
      downloads: Number(r.SubDownloadsCnt) || 0,
      source: "opensubtitles" as const,
    }))
}

/* ---------------- Source 2: Stremio's OpenSubtitles v3 ---------------- */

async function fromStremioV3(p: ParsedId, lang: "ara" | "eng"): Promise<SubtitleItem[]> {
  const type = p.season !== undefined ? "series" : "movie"
  const id = p.season !== undefined ? `${p.imdb}:${p.season}:${p.episode}` : p.imdb
  const data = (await getJson(
    `https://opensubtitles-v3.strem.io/subtitles/${type}/${encodeURIComponent(id)}.json`,
    8000,
  )) as { subtitles?: Array<Record<string, unknown>> } | null

  const rows = data && Array.isArray(data.subtitles) ? data.subtitles : []
  const want = lang === "ara" ? ARABIC : new Set(["eng", "en"])

  return rows
    .filter((r) => r && want.has(String(r.lang || "").toLowerCase()))
    .map((r) => {
      const url = String(r.url || "")
      const m = url.match(/\/file\/(\d+)/)
      return {
        key: m ? `os-${m[1]}` : `v3-${r.id}`,
        url,
        name: lang === "ara" ? "Arabic" : "English",
        downloads: 0,
        source: "stremio" as const,
      }
    })
    .filter((r) => r.url)
}

/* ---------------- Source 3: SubSource (films and series) ---------------- */
// SubSource has by far the deepest Arabic catalogue (58 entries for Skyfall,
// 223 for Game of Thrones season 1) and — critically — it is reachable from
// Vercel, unlike OpenSubtitles, which Cloudflare blocks for datacenter IPs.
//
// It is addressed by title slug rather than IMDb id, so slugs are built from
// Stremio's free Cinemeta metadata:
//   films  -> "skyfall-2012"             (title + release year)
//   series -> "game-of-thrones/season-1" (title, then a season path segment)

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

async function subsourcePath(p: ParsedId): Promise<string | null> {
  const type = p.season !== undefined ? "series" : "movie"
  const meta = (await getJson(
    `https://v3-cinemeta.strem.io/meta/${type}/${p.imdb}.json`,
    6000,
  )) as { meta?: { name?: string; year?: string; releaseInfo?: string } } | null

  const name = meta?.meta?.name
  if (!name) return null
  const slug = slugify(name)
  if (!slug) return null

  if (p.season !== undefined) return `${slug}/season-${p.season}`

  const year = String(meta.meta?.year || meta.meta?.releaseInfo || "").match(/\d{4}/)?.[0]
  return year ? `${slug}-${year}` : null
}

// A season listing covers every episode, so results must be narrowed to the
// requested one. Season packs (no episode marker) are excluded deliberately:
// they are multi-file archives and we cannot tell which file is this episode.
function isEpisode(releaseInfo: string, season: number, episode: number): boolean {
  const info = String(releaseInfo)
  if (new RegExp(`s0*${season}e0*${episode}(?!\\d)`, "i").test(info)) return true
  if (new RegExp(`(^|[^\\d])${season}x0*${episode}(?!\\d)`, "i").test(info)) return true
  return false
}

async function fromSubSource(p: ParsedId): Promise<SubtitleItem[]> {
  const path = await subsourcePath(p)
  if (!path) return []

  const data = (await getJson(
    `https://api.subsource.net/v1/subtitles/${path}/arabic`,
    8000,
    BROWSER_UA,
  )) as { subtitles?: Array<Record<string, unknown>> } | null

  let rows = data && Array.isArray(data.subtitles) ? data.subtitles : []
  rows = rows.filter((r) => r && /arab/i.test(String(r.language || "")) && r.link)

  if (p.season !== undefined && p.episode !== undefined) {
    const season = p.season
    const episode = p.episode
    rows = rows.filter((r) => isEpisode(String(r.release_info || ""), season, episode))
  }

  return rows.map((r) => ({
    key: `ss-${r.id}`,
    // Served through our own proxy, which unzips and re-encodes.
    url: `/api/sub?s=${Buffer.from(String(r.link), "utf-8").toString("base64url")}`,
    name: String(r.release_info || "Arabic"),
    downloads: Number(r.downloads) || 0,
    source: "subsource" as const,
  }))
}

/* ---------------- Aggregation ---------------- */

export async function getArabicSubtitles(p: ParsedId): Promise<SubtitleItem[]> {
  const settled = await Promise.allSettled([
    fromOpenSubtitles(p, "ara"),
    fromStremioV3(p, "ara"),
    fromSubSource(p),
  ])
  const all = settled.flatMap((s) => (s.status === "fulfilled" ? s.value : []))

  const byKey = new Map<string, SubtitleItem>()
  for (const item of all) {
    const existing = byKey.get(item.key)
    if (!existing || item.downloads > existing.downloads) byKey.set(item.key, item)
  }

  return [...byKey.values()].sort((a, b) => b.downloads - a.downloads)
}

// Best English subtitle, used as the base for auto-translation.
export async function getBestEnglishUrl(p: ParsedId): Promise<string | null> {
  const settled = await Promise.allSettled([
    fromOpenSubtitles(p, "eng"),
    fromStremioV3(p, "eng"),
  ])
  const all = settled.flatMap((s) => (s.status === "fulfilled" ? s.value : []))
  if (!all.length) return null
  all.sort((a, b) => b.downloads - a.downloads)
  return all[0].url
}

/* ---------------- Diagnostics ---------------- */
// Reports what each source returns *from the machine actually running this
// code*. Local results and production results can differ (a provider may block
// datacenter IPs), and without this you are guessing.

export interface SourceProbe {
  source: string
  ok: boolean
  count: number
  ms: number
  error?: string
}

export async function probeSources(p: ParsedId): Promise<SourceProbe[]> {
  const jobs: Array<[string, () => Promise<SubtitleItem[]>]> = [
    ["opensubtitles", () => fromOpenSubtitles(p, "ara")],
    ["stremio-v3", () => fromStremioV3(p, "ara")],
    ["subsource", () => fromSubSource(p)],
    ["english-for-ai", () => fromStremioV3(p, "eng")],
  ]

  return Promise.all(
    jobs.map(async ([name, fn]) => {
      const started = Date.now()
      try {
        const items = await fn()
        return { source: name, ok: true, count: items.length, ms: Date.now() - started }
      } catch (e) {
        return {
          source: name,
          ok: false,
          count: 0,
          ms: Date.now() - started,
          error: e instanceof Error ? e.message : "unknown",
        }
      }
    }),
  )
}

// Raw reachability check for the provider most likely to be IP-blocked.
export async function probeOpenSubtitlesRaw(): Promise<Record<string, unknown>> {
  const url = "https://rest.opensubtitles.org/search/imdbid-1074638/sublanguageid-ara"
  const started = Date.now()
  try {
    const ctl = new AbortController()
    const timer = setTimeout(() => ctl.abort(), 8000)
    const r = await fetch(url, {
      signal: ctl.signal,
      headers: { "User-Agent": ADDON_UA, Accept: "application/json" },
    })
    clearTimeout(timer)
    const body = await r.text()
    return {
      status: r.status,
      ms: Date.now() - started,
      bytes: body.length,
      looksLikeJson: body.startsWith("["),
      snippet: body.slice(0, 120),
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "unknown", ms: Date.now() - started }
  }
}
