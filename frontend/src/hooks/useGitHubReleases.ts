import { useState, useEffect, useCallback } from "react";

const GITHUB_REPO = "KunLabAI/KunFlix";
const GITHUB_API = `https://api.github.com/repos/${GITHUB_REPO}/releases`;
const CACHE_KEY = "github_releases_cache";
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes

export interface GitHubRelease {
  id: number;
  tag_name: string;
  name: string;
  body: string;
  published_at: string;
  html_url: string;
  prerelease: boolean;
  draft: boolean;
}

interface CacheEntry {
  data: GitHubRelease[];
  timestamp: number;
}

function readCache(): GitHubRelease[] | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    const entry: CacheEntry | null = raw ? JSON.parse(raw) : null;
    return entry && Date.now() - entry.timestamp < CACHE_TTL ? entry.data : null;
  } catch {
    return null;
  }
}

function writeCache(data: GitHubRelease[]) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ data, timestamp: Date.now() }));
  } catch { /* quota exceeded – ignore */ }
}

export function useGitHubReleases(enabled: boolean, limit = 20) {
  const [releases, setReleases] = useState<GitHubRelease[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchReleases = useCallback(async () => {
    const cached = readCache();
    if (cached) {
      setReleases(cached.slice(0, limit));
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${GITHUB_API}?per_page=${limit}`, {
        headers: { Accept: "application/vnd.github+json" },
      });
      const data: GitHubRelease[] = await res.json();
      const filtered = data.filter((r) => !r.draft);
      writeCache(filtered);
      setReleases(filtered.slice(0, limit));
    } catch {
      setError("fetch_failed");
    }
    setLoading(false);
  }, [limit]);

  useEffect(() => {
    if (enabled) fetchReleases();
  }, [enabled, fetchReleases]);

  return { releases, loading, error, refetch: fetchReleases };
}
