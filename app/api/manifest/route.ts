const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "*",
}

export async function GET(request: Request) {
  const origin = new URL(request.url).origin

  const manifest = {
    id: "org.andro.arabic.subtitles",
    version: "2.0.0",
    name: "ANDRO",
    description:
      "Free, open-source Arabic subtitles for every movie and series. Searches multiple subtitle databases at once and ranks the best first, plus AI auto-translated Arabic for anything with no Arabic subtitles at all. No account, no API key, no payment — ever.",
    logo: `${origin}/logo.png`,
    types: ["movie", "series"],
    resources: [
      {
        name: "subtitles",
        types: ["movie", "series"],
        idPrefixes: ["tt"],
      },
    ],
    catalogs: [],
    idPrefixes: ["tt"],
    behaviorHints: {
      configurable: false,
      configurationRequired: false,
    },
  }

  return new Response(JSON.stringify(manifest), {
    status: 200,
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=86400",
    },
  })
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS })
}
