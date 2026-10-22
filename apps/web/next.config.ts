import type { NextConfig } from "next"
import path from "node:path"
import { fileURLToPath } from "node:url"

const appDirectory = path.dirname(fileURLToPath(import.meta.url))
const monorepoRoot = path.resolve(appDirectory, "../..")

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: monorepoRoot,
  transpilePackages: ["@workspace/db", "@workspace/ui"],
  experimental: {
    agentUpgrade: "security",
  },
}

export default nextConfig
