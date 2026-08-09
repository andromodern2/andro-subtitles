# ANDRO — Free Arabic Subtitles for Stremio

Automatic Arabic subtitles for every movie and series in Stremio.
Free and open source. No account, no API key, no payment.

**Manifest URL (paste into Stremio):** https://androsubs.vercel.app/manifest.json
**Also works at:** https://andro-lime.vercel.app/manifest.json

---

## How it works

Three subtitle databases are searched **at the same time**, merged, de-duplicated
and ranked by popularity. On top of that, any title with an English subtitle
also gets an **AI auto-translated Arabic** option, so there is effectively
always something to watch with.

| Source | Covers | Delivery |
| --- | --- | --- |
| SubSource | Films (deepest Arabic catalogue) | Downloaded, unzipped and re-encoded by `/api/sub` |
| OpenSubtitles (legacy REST) | Films and series | Served via Stremio's UTF-8 gateway |
| Stremio OpenSubtitles v3 | Films and series | Served directly |
| AI translation | Anything with an English subtitle | Translated on demand by `/api/sub` |

### The rule that keeps it alive

Every source runs inside `Promise.allSettled` with its own timeout. **One source
failing can never blank the list.** This is verified by fault injection, not assumed.

---

## Measured results

Subtitles found per title:

| Title | v1 | v2 |
| --- | --- | --- |
| Skyfall | 11 | **41** |
| The Shawshank Redemption | 11 | **41** |
| Game of Thrones S1E1 | 11 | **41** |
| Oppenheimer | 11 | **36** |

Performance and resilience:

- Typical response: **~300ms**
- 30 concurrent requests: **0 failures, 1449ms total**
- Full-film translation (1121 cues): **~0.9s**, timings preserved exactly
- **Fault injection** — OpenSubtitles pointed at a dead host: Skyfall still
  returned **35 subtitles** instead of going blank

---

## Bugs fixed in v2

### 1. Cached emptiness (this is what took the addon down)

When a source hiccupped, the old code returned `{"subtitles":[]}` *and* told
Vercel to cache that for 6 hours with a 7-day stale window. The empty answer
froze at the CDN edge, per title, long after the source recovered. Popular
titles were hit hardest, which is why it appeared right after the addon got
popular.

**Fix:** empty responses are now sent with `Cache-Control: no-store` and are
never cached. Successful responses are still cached hard.

> **Emergency remedy** if subtitles ever go blank: redeploy from the Vercel
> dashboard. That purges the edge cache immediately.

### 2. Series were completely broken

IMDb leading zeros were being stripped (`tt0944947` → `944947`), which makes the
OpenSubtitles API redirect to an empty body. Every season of every show was
affected. **Fix:** zeros are preserved.

### 3. Results were capped at 11

The old code trimmed the list to 11 even when far more existed — SubSource alone
has 58 Arabic subtitles for Skyfall. **Fix:** up to 40 ranked results.

### 4. Path segment order

The OpenSubtitles legacy API requires **alphabetically ordered** path segments
(`episode-1/imdbid-0944947/season-1/sublanguageid-ara`) or it silently returns
nothing.

---

## Deploying

Connected to Vercel, this deploys on every push to `main`. No environment
variables and no settings are required.

## Project layout

```
app/
  page.tsx                          landing page
  layout.tsx                        fonts and metadata
  globals.css                       styling
  api/manifest/route.ts             the manifest Stremio reads
  api/subtitles/[...args]/route.ts  subtitle search
  api/sub/route.ts                  file delivery + AI translation
lib/
  sources.ts                        the three sources, failure-isolated
  translate.ts                      English to Arabic translation
  srt.ts                            subtitle parsing and encoding repair
next.config.mjs                     maps /manifest.json and /subtitles/*
```

## Local development

```bash
npm install
npm run dev
```

## Licence

MIT — free forever.
