/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // ── Static export for Chrome Extension packaging ─────────────────────────
  output: "export",

  // Output to /dist — the build script copies this into /extension
  distDir: "dist",

  // Makes all asset paths relative so they resolve from chrome-extension://
  assetPrefix: "./",

  // next/image requires a loader when not using a server
  images: {
    unoptimized: true,
  },

  // Ensures /analyze/ → /analyze/index.html (file-based routing in extension)
  trailingSlash: true,
};

module.exports = nextConfig;
