import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // `next dev` otherwise writes a managed AGENTS.md when it detects a coding agent; repo instructions live in CLAUDE.md only.
  agentRules: false,
};

export default nextConfig;
