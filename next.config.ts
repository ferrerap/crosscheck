import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdfjs loads its worker file at runtime; bundling breaks that path on the server.
  serverExternalPackages: ["pdfjs-dist"],
};

export default nextConfig;
