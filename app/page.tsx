"use client"

import { useEffect, useState } from "react"

const FEATURES = [
  {
    title: "Arabic subs for everything",
    body: "Searches the largest free subtitle database on earth, covering virtually every movie and series with Arabic subtitles.",
  },
  {
    title: "Auto-detects working subs",
    body: "Smart ranking puts trusted, most-downloaded, correctly-synced subtitles first — bad and mislabeled files are pushed out.",
  },
  {
    title: "Zero delay, no garbled text",
    body: "Legacy Arabic encodings (windows-1256) are converted to UTF-8 on the fly, so subs load instantly and render perfectly.",
  },
  {
    title: "Free forever",
    body: "No API key, no account, no subscription, no hidden costs. Completely free and open source under the ANDRO name.",
  },
  {
    title: "No setup, no tools",
    body: "One click installs the addon into Stremio. Subtitles appear automatically in the player for anything you watch.",
  },
  {
    title: "Never silently empty",
    body: "Two independent subtitle sources are queried at once, and an empty result is never cached — so a hiccup upstream can never leave you with a blank list.",
  },
]

const STEPS = [
  {
    n: "01",
    title: "Install",
    body: "Click Install to Stremio, or copy the manifest URL and paste it into the Stremio addon search.",
  },
  {
    n: "02",
    title: "Play anything",
    body: "Open any movie or series episode in Stremio like you normally would.",
  },
  {
    n: "03",
    title: "Pick Arabic",
    body: "Open the subtitles menu in the player — ANDRO Arabic subs are ranked best-first. Select one and enjoy.",
  },
]

export default function Home() {
  const [manifestUrl, setManifestUrl] = useState("")
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    setManifestUrl(`${window.location.origin}/manifest.json`)
  }, [])

  const installUrl = manifestUrl ? manifestUrl.replace(/^https?:\/\//, "stremio://") : "#"

  async function copy() {
    try {
      await navigator.clipboard.writeText(manifestUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }

  return (
    <main>
      <div className="hero">
        <div className="wrap">
          <div className="brandRow">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="ANDRO logo" />
            <span className="brandName">ANDRO</span>
          </div>

          <div className="badges">
            <span className="badge accent">Open Source</span>
            <span className="badge">Stremio Addon</span>
          </div>

          <h1>Automatic Arabic subtitles for every movie and series</h1>

          <p className="lede">
            ANDRO finds the best working Arabic subtitles for anything you watch in Stremio —
            instantly, with perfect encoding and zero delay. Free and open source. No API keys, no
            accounts, no payments.
          </p>

          <a className="installBtn" href={installUrl}>
            Install to Stremio
          </a>

          <div className="urlRow">
            <div className="urlBox">{manifestUrl || "Loading addon URL..."}</div>
            <button className="copyBtn" onClick={copy} disabled={!manifestUrl}>
              {copied ? "Copied" : "Copy"}
            </button>
          </div>

          <p className="hint">
            Or paste the URL in Stremio: Addons &gt; Add addon &gt; paste &gt; Install
          </p>

          <p className="arabicLine">ترجمة عربية تلقائية لكل فيلم ومسلسل</p>
        </div>
      </div>

      <section>
        <div className="wrap">
          <h2>Everything you need, nothing you pay for</h2>
          <div className="grid">
            {FEATURES.map((f) => (
              <div className="card" key={f.title}>
                <h3>{f.title}</h3>
                <p>{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section>
        <div className="wrap">
          <h2>How it works</h2>
          <div className="steps">
            {STEPS.map((s) => (
              <div className="step" key={s.n}>
                <div className="stepNum">{s.n}</div>
                <h3>{s.title}</h3>
                <p>{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer>
        <div className="wrap">
          <div>ANDRO — free &amp; open-source Arabic subtitles for Stremio</div>
          <div className="tag">Open source, forever free</div>
        </div>
      </footer>
    </main>
  )
}
