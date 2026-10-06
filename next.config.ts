import type { NextConfig } from "next";

/*
 * Wersja w oknie „O systemie”: zmienne systemowe Vercela z chwili builda (lokalnie ich nie ma → „lokalnie”).
 * https://vercel.com/docs/environment-variables/system-environment-variables
 */
const commit = process.env.VERCEL_GIT_COMMIT_SHA ?? "";
const repo =
  process.env.VERCEL_GIT_PROVIDER === "github" && process.env.VERCEL_GIT_REPO_OWNER && process.env.VERCEL_GIT_REPO_SLUG
    ? `https://github.com/${process.env.VERCEL_GIT_REPO_OWNER}/${process.env.VERCEL_GIT_REPO_SLUG}`
    : "";

const nextConfig: NextConfig = {
  // Wskaźnik deweloperski Next.js zasłaniał pulpit; błędy kompilacji i runtime nadal są pokazywane.
  devIndicators: false,
  env: {
    OBOK_COMMIT: commit,
    OBOK_BUILT_AT: commit ? new Date().toISOString() : "",
    OBOK_REPO: repo,
  },
};

export default nextConfig;
