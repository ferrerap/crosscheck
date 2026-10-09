import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdfjs loads its worker file at runtime; bundling breaks that path on the server.
  serverExternalPackages: ["pdfjs-dist"],
  turbopack: {
    // The standard pdf.js build calls APIs only the newest browsers have (Map.prototype.getOrInsertComputed,
    // Uint8Array.fromBase64) and throws on most phones. In the browser, react-pdf gets pdf.js's legacy build,
    // which polyfills them. The paths name react-pdf's own pdf.js copy (the version it is built against; a bare
    // specifier would resolve to the top-level install); public/pdf.worker.min.mjs is that copy's legacy worker.
    resolveAlias: {
      "pdfjs-dist": { browser: "./node_modules/react-pdf/node_modules/pdfjs-dist/legacy/build/pdf.mjs" },
      "pdfjs-dist/web/pdf_viewer.mjs": { browser: "./node_modules/react-pdf/node_modules/pdfjs-dist/legacy/web/pdf_viewer.mjs" },
    },
  },
};

export default nextConfig;
