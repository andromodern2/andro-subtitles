import { parseId, probeSources, probeOpenSubtitlesRaw } from "@/lib/sources"

export const dynamic = "force-dynamic"
export const maxDuration = 30

export async function GET() {
  const movie = parseId("tt1074638")!
  const series = parseId("tt0944947:1:1")!

  const [movieProbe, seriesProbe, rawOpenSubtitles] = await Promise.all([
    probeSources(movie),
    probeSources(series),
    probeOpenSubtitlesRaw(),
  ])

  return new Response(
    JSON.stringify(
      { checkedAt: new Date().toISOString(), movieProbe, seriesProbe, rawOpenSubtitles },
      null,
      2,
    ),
    { status: 200, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } },
  )
}
