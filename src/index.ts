import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import {
  createTextPost,
  createImagePost,
  createDocumentPost,
  whoAmI,
} from "./linkedin.js";
import { markdownToLinkedIn, lintPost } from "./formatter.js";
import {
  listDrafts,
  readDraft,
  saveDraft,
  setStatus,
} from "./drafts.js";
import {
  ghWhoAmI,
  listRepos,
  listCommits,
  getCommit,
  listReleases,
  getFileContent,
  createOrUpdateFile,
  createGist,
  createIssue,
  createPullRequest,
  searchCode,
} from "./github.js";

const server = new McpServer({ name: "linkedin-mcp", version: "0.1.0" });

function text(s: string) {
  return { content: [{ type: "text" as const, text: s }] };
}

/* ---------- PUBLISHING (hits LinkedIn API) ---------- */

server.tool(
  "publish_text_post",
  "Publish a plain-text post to your LinkedIn feed right now.",
  {
    commentary: z.string().describe("The post text (markdown ok, auto-converted)."),
    visibility: z.enum(["PUBLIC", "CONNECTIONS"]).default("PUBLIC"),
  },
  async ({ commentary, visibility }) => {
    const clean = markdownToLinkedIn(commentary);
    const lint = lintPost(clean);
    if (lint.charCount > 3000)
      return text(`Refused: ${lint.warnings.join(" ")}`);
    const urn = await createTextPost(clean, visibility);
    return text(`Published. ${urn}\nWarnings: ${lint.warnings.join("; ") || "none"}`);
  }
);

server.tool(
  "publish_image_post",
  "Publish a post with one image from a local file path.",
  {
    commentary: z.string(),
    image_path: z.string().describe("Absolute path to a local image file."),
    alt_text: z.string().default(""),
  },
  async ({ commentary, image_path, alt_text }) => {
    const urn = await createImagePost(
      markdownToLinkedIn(commentary),
      image_path,
      alt_text
    );
    return text(`Published image post. ${urn}`);
  }
);

server.tool(
  "publish_document_post",
  "Publish a document/carousel post from a local PDF (each PDF page = a slide).",
  {
    commentary: z.string(),
    pdf_path: z.string().describe("Absolute path to a local PDF."),
    title: z.string().describe("Title shown on the document card."),
  },
  async ({ commentary, pdf_path, title }) => {
    const urn = await createDocumentPost(
      markdownToLinkedIn(commentary),
      pdf_path,
      title
    );
    return text(`Published document post. ${urn}`);
  }
);

/* ---------- FORMATTING / LINTING (local, no API) ---------- */

server.tool(
  "format_for_linkedin",
  "Convert markdown into LinkedIn-ready text (unicode bold/italic, bullets, spacing) WITHOUT publishing. Use this to preview or to copy-paste into an article.",
  { markdown: z.string() },
  async ({ markdown }) => text(markdownToLinkedIn(markdown))
);

server.tool(
  "lint_post",
  "Check a post for length, hook length, and hashtags. Does not publish.",
  { text: z.string() },
  async (args) => {
    const r = lintPost(markdownToLinkedIn(args.text));
    return text(
      `chars: ${r.charCount}\nok: ${r.ok}\n${r.warnings.map((w) => "- " + w).join("\n") || "no warnings"}`
    );
  }
);

/* ---------- LOCAL DRAFTS (no API — works for articles too) ---------- */

server.tool(
  "list_drafts",
  "List all local drafts with their type and status.",
  {},
  async () => {
    const ds = listDrafts();
    if (!ds.length) return text("No drafts yet.");
    return text(
      ds
        .map((d) => `${d.slug} [${d.type}/${d.status}]${d.scheduled_at ? ` @${d.scheduled_at}` : ""}`)
        .join("\n")
    );
  }
);

server.tool(
  "read_draft",
  "Read the full body of one draft by slug.",
  { slug: z.string() },
  async ({ slug }) => {
    const d = readDraft(slug);
    return text(`[${d.type}/${d.status}]\n\n${d.body}`);
  }
);

server.tool(
  "save_draft",
  "Create or overwrite a local draft. Use type 'article' for long-form Pulse pieces (these must be published manually via the web editor).",
  {
    slug: z.string().describe("Filename-safe id, e.g. grpc-service-mesh."),
    body: z.string(),
    type: z.enum(["post", "article"]).default("post"),
    status: z.enum(["idea", "ready", "scheduled", "published"]).default("ready"),
    scheduled_at: z.string().optional().describe("ISO datetime if scheduling."),
  },
  async ({ slug, body, type, status, scheduled_at }) => {
    saveDraft(slug, body, type, status, scheduled_at);
    return text(`Saved draft "${slug}" as ${type}/${status}.`);
  }
);

server.tool(
  "set_draft_status",
  "Update a draft's status (idea/ready/scheduled/published).",
  {
    slug: z.string(),
    status: z.enum(["idea", "ready", "scheduled", "published"]),
  },
  async ({ slug, status }) => {
    setStatus(slug, status);
    return text(`"${slug}" is now ${status}.`);
  }
);

server.tool(
  "prepare_article_for_paste",
  "Get an article draft as clean LinkedIn text ready to paste into the web editor (articles cannot be published via API). Returns the text to copy.",
  { slug: z.string() },
  async ({ slug }) => {
    const d = readDraft(slug);
    if (d.type !== "article")
      return text(`Note: "${slug}" is a post, not an article.`);
    return text(
      "Copy the text below into LinkedIn's article editor (Write article), then publish manually:\n\n" +
        markdownToLinkedIn(d.body)
    );
  }
);

server.tool(
  "who_am_i",
  "Show the authorized LinkedIn identity.",
  {},
  async () => {
    const me = whoAmI();
    return text(`${me.name ?? "(name unknown)"} — ${me.person_urn}`);
  }
);

/* ---------- GITHUB (full-access personal token) ---------- */

server.tool(
  "github_who_am_i",
  "Show the authenticated GitHub identity.",
  {},
  async () => {
    const me = await ghWhoAmI();
    return text(`${me.login}${me.name ? ` (${me.name})` : ""}`);
  }
);

server.tool(
  "github_list_repos",
  "List your GitHub repos, most recently updated first.",
  { per_page: z.number().default(30) },
  async ({ per_page }) => {
    const repos = await listRepos(per_page);
    return text(
      repos.map((r) => `${r.full_name}${r.private ? " [private]" : ""} — ${r.description ?? ""}`).join("\n")
    );
  }
);

server.tool(
  "github_list_commits",
  "List commits on a repo, optionally filtered by time window, author, or branch.",
  {
    owner: z.string(),
    repo: z.string(),
    since: z.string().optional().describe("ISO datetime."),
    until: z.string().optional().describe("ISO datetime."),
    author: z.string().optional(),
    sha: z.string().optional().describe("Branch, tag, or commit SHA to start from."),
    per_page: z.number().default(30),
  },
  async ({ owner, repo, since, until, author, sha, per_page }) => {
    const commits = await listCommits(owner, repo, { since, until, author, sha, perPage: per_page });
    return text(
      commits
        .map((c) => `${c.sha.slice(0, 7)} ${c.commit.author.date} — ${c.commit.message.split("\n")[0]}`)
        .join("\n") || "No commits found."
    );
  }
);

server.tool(
  "github_get_commit",
  "Get one commit's full message and per-file diffs — use this to summarize what changed.",
  { owner: z.string(), repo: z.string(), sha: z.string() },
  async ({ owner, repo, sha }) => {
    const c = await getCommit(owner, repo, sha);
    const filesText = c.files
      .map((f) => `--- ${f.filename} (${f.status}, +${f.additions}/-${f.deletions}) ---\n${f.patch ?? "(no patch, binary or too large)"}`)
      .join("\n\n");
    return text(`${c.commit.message}\n\n${filesText}`);
  }
);

server.tool(
  "github_list_releases",
  "List a repo's releases (tag, title, notes), newest first.",
  { owner: z.string(), repo: z.string(), per_page: z.number().default(10) },
  async ({ owner, repo, per_page }) => {
    const rels = await listReleases(owner, repo, per_page);
    return text(
      rels.map((r) => `## ${r.name || r.tag_name} (${r.published_at})\n${r.body}`).join("\n\n") || "No releases."
    );
  }
);

server.tool(
  "github_get_file",
  "Read a file's content from a repo (e.g. a README or doc) at a given ref.",
  { owner: z.string(), repo: z.string(), path: z.string(), ref: z.string().optional() },
  async ({ owner, repo, path, ref }) => {
    const f = await getFileContent(owner, repo, path, ref);
    return text(f.content);
  }
);

server.tool(
  "github_write_file",
  "Create or update a file in a repo (auto-detects if it exists). Commits directly.",
  {
    owner: z.string(),
    repo: z.string(),
    path: z.string(),
    content: z.string(),
    message: z.string().describe("Commit message."),
    branch: z.string().optional(),
  },
  async ({ owner, repo, path, content, message, branch }) => {
    const r = await createOrUpdateFile(owner, repo, path, content, message, branch);
    return text(`Committed ${path}. ${r.html_url ?? ""}`);
  }
);

server.tool(
  "github_create_gist",
  "Create a gist from one or more files — handy for a code snippet linked from a LinkedIn post.",
  {
    description: z.string(),
    files: z.record(z.string(), z.string()).describe("Map of filename -> file content."),
    public: z.boolean().default(false),
  },
  async ({ description, files, public: isPublic }) => {
    const g = await createGist(description, files, isPublic);
    return text(`Created gist: ${g.html_url}`);
  }
);

server.tool(
  "github_create_issue",
  "File an issue — e.g. to track a content idea or a doc that needs writing.",
  {
    owner: z.string(),
    repo: z.string(),
    title: z.string(),
    body: z.string().optional(),
    labels: z.array(z.string()).optional(),
  },
  async ({ owner, repo, title, body, labels }) => {
    const i = await createIssue(owner, repo, title, body, labels);
    return text(`Created issue #${i.number}: ${i.html_url}`);
  }
);

server.tool(
  "github_create_pull_request",
  "Open a pull request, e.g. after committing a docs/README update to a branch.",
  {
    owner: z.string(),
    repo: z.string(),
    title: z.string(),
    head: z.string().describe("Branch with the changes."),
    base: z.string().describe("Branch to merge into, e.g. main."),
    body: z.string().optional(),
  },
  async ({ owner, repo, title, head, base, body }) => {
    const pr = await createPullRequest(owner, repo, title, head, base, body);
    return text(`Opened PR #${pr.number}: ${pr.html_url}`);
  }
);

server.tool(
  "github_search_code",
  "Search code across your accessible repos (and public GitHub) for examples or references.",
  { query: z.string(), per_page: z.number().default(10) },
  async ({ query, per_page }) => {
    const r = await searchCode(query, per_page);
    return text(
      r.items.map((i) => `${i.repository.full_name}: ${i.path} — ${i.html_url}`).join("\n") || "No results."
    );
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
