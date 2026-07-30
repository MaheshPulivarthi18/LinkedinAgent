import { GITHUB_TOKEN } from "./config.js";

const API = "https://api.github.com";

function headers(extra: Record<string, string> = {}) {
  if (!GITHUB_TOKEN) {
    throw new Error(
      "No GITHUB_TOKEN set. Add it to your MCP server env (see README)."
    );
  }
  return {
    Authorization: `Bearer ${GITHUB_TOKEN}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    ...extra,
  };
}

async function gh<T>(
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: headers(
      init.body ? { "Content-Type": "application/json" } : {}
    ),
  });
  if (!res.ok) {
    throw new Error(`GitHub ${init.method ?? "GET"} ${path} failed (${res.status}): ${await res.text()}`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/** Authenticated user. */
export async function ghWhoAmI(): Promise<{ login: string; name?: string }> {
  return gh("/user");
}

/** Repos you own or collaborate on, most recently updated first. */
export async function listRepos(perPage = 30): Promise<
  { full_name: string; private: boolean; description?: string; updated_at: string }[]
> {
  return gh(`/user/repos?per_page=${perPage}&sort=updated`);
}

/** Commits on a repo, optionally scoped by time window / author / branch. */
export async function listCommits(
  owner: string,
  repo: string,
  opts: { since?: string; until?: string; author?: string; sha?: string; perPage?: number } = {}
): Promise<
  { sha: string; commit: { message: string; author: { name: string; date: string } }; html_url: string }[]
> {
  const q = new URLSearchParams({ per_page: String(opts.perPage ?? 30) });
  if (opts.since) q.set("since", opts.since);
  if (opts.until) q.set("until", opts.until);
  if (opts.author) q.set("author", opts.author);
  if (opts.sha) q.set("sha", opts.sha);
  return gh(`/repos/${owner}/${repo}/commits?${q}`);
}

/** A single commit with per-file diffs/patches — useful for summarizing what changed. */
export async function getCommit(
  owner: string,
  repo: string,
  sha: string
): Promise<{
  sha: string;
  commit: { message: string; author: { name: string; date: string } };
  html_url: string;
  stats: { additions: number; deletions: number; total: number };
  files: { filename: string; status: string; additions: number; deletions: number; patch?: string }[];
}> {
  return gh(`/repos/${owner}/${repo}/commits/${sha}`);
}

/** Releases, newest first. */
export async function listReleases(
  owner: string,
  repo: string,
  perPage = 10
): Promise<{ tag_name: string; name: string; body: string; html_url: string; published_at: string }[]> {
  return gh(`/repos/${owner}/${repo}/releases?per_page=${perPage}`);
}

/** Decoded text content of a file at a given ref (default branch if omitted). */
export async function getFileContent(
  owner: string,
  repo: string,
  path: string,
  ref?: string
): Promise<{ content: string; sha: string }> {
  const q = ref ? `?ref=${encodeURIComponent(ref)}` : "";
  const res = await gh<{ content: string; sha: string; encoding: string }>(
    `/repos/${owner}/${repo}/contents/${path}${q}`
  );
  return { content: Buffer.from(res.content, "base64").toString("utf8"), sha: res.sha };
}

/** Create a new file or update an existing one (auto-detects existing sha). */
export async function createOrUpdateFile(
  owner: string,
  repo: string,
  path: string,
  content: string,
  message: string,
  branch?: string
): Promise<{ html_url?: string; sha: string }> {
  let sha: string | undefined;
  try {
    sha = (await getFileContent(owner, repo, path, branch)).sha;
  } catch {
    // File doesn't exist yet — creating, not updating.
  }
  const body: Record<string, unknown> = {
    message,
    content: Buffer.from(content, "utf8").toString("base64"),
    ...(sha ? { sha } : {}),
    ...(branch ? { branch } : {}),
  };
  const res = await gh<{ content: { html_url: string; sha: string } }>(
    `/repos/${owner}/${repo}/contents/${path}`,
    { method: "PUT", body: JSON.stringify(body) }
  );
  return { html_url: res.content.html_url, sha: res.content.sha };
}

/** Create a gist (e.g. a code snippet to link/embed from a LinkedIn post). */
export async function createGist(
  description: string,
  files: Record<string, string>,
  isPublic = false
): Promise<{ html_url: string }> {
  const body = {
    description,
    public: isPublic,
    files: Object.fromEntries(Object.entries(files).map(([name, content]) => [name, { content }])),
  };
  return gh(`/gists`, { method: "POST", body: JSON.stringify(body) });
}

/** File an issue — handy for a "content ideas" backlog living on GitHub. */
export async function createIssue(
  owner: string,
  repo: string,
  title: string,
  body?: string,
  labels?: string[]
): Promise<{ html_url: string; number: number }> {
  return gh(`/repos/${owner}/${repo}/issues`, {
    method: "POST",
    body: JSON.stringify({ title, body, labels }),
  });
}

/** Open a pull request. */
export async function createPullRequest(
  owner: string,
  repo: string,
  title: string,
  head: string,
  base: string,
  body?: string
): Promise<{ html_url: string; number: number }> {
  return gh(`/repos/${owner}/${repo}/pulls`, {
    method: "POST",
    body: JSON.stringify({ title, head, base, body }),
  });
}

/** Search code across repos you have access to (and public GitHub). */
export async function searchCode(
  query: string,
  perPage = 10
): Promise<{ items: { name: string; path: string; repository: { full_name: string }; html_url: string }[] }> {
  return gh(`/search/code?q=${encodeURIComponent(query)}&per_page=${perPage}`);
}
