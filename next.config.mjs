/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    return [
      // Stremio requests these paths at the domain root.
      { source: "/manifest.json", destination: "/api/manifest" },
      { source: "/subtitles/:args*", destination: "/api/subtitles/:args*" },
    ]
  },
}
export default nextConfig
