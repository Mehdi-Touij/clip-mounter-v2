import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Native / heavy runtime modules — keep external so Next doesn't try to bundle them.
  serverExternalPackages: ["better-sqlite3", "@huggingface/transformers", "onnxruntime-node", "rss-parser", "sharp"],
};

export default nextConfig;
