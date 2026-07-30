import {
  readFileSync,
  writeFileSync,
  readdirSync,
  existsSync,
  mkdirSync,
} from "node:fs";
import { join } from "node:path";
import { DRAFTS_DIR } from "./config.js";

// Drafts are just markdown files with a tiny YAML-ish front-matter block.
// Because they're plain files, you get git history for free.
// Front matter fields: type (post|article), status (idea|ready|scheduled|published), scheduled_at.

function ensureDir() {
  if (!existsSync(DRAFTS_DIR)) mkdirSync(DRAFTS_DIR, { recursive: true });
}

export interface Draft {
  slug: string;
  type: "post" | "article";
  status: "idea" | "ready" | "scheduled" | "published";
  scheduled_at?: string;
  body: string;
}

function parse(slug: string, raw: string): Draft {
  const m = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  const meta: Record<string, string> = {};
  let body = raw;
  if (m) {
    for (const line of m[1].split("\n")) {
      const idx = line.indexOf(":");
      if (idx > -1)
        meta[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
    }
    body = m[2];
  }
  return {
    slug,
    type: (meta.type as Draft["type"]) ?? "post",
    status: (meta.status as Draft["status"]) ?? "idea",
    scheduled_at: meta.scheduled_at || undefined,
    body: body.trim(),
  };
}

function serialize(d: Draft): string {
  const fm = [
    "---",
    `type: ${d.type}`,
    `status: ${d.status}`,
    ...(d.scheduled_at ? [`scheduled_at: ${d.scheduled_at}`] : []),
    "---",
    "",
  ].join("\n");
  return fm + d.body.trim() + "\n";
}

export function listDrafts(): Draft[] {
  ensureDir();
  return readdirSync(DRAFTS_DIR)
    .filter((f) => f.endsWith(".md"))
    .map((f) => parse(f.replace(/\.md$/, ""), readFileSync(join(DRAFTS_DIR, f), "utf8")));
}

export function readDraft(slug: string): Draft {
  const p = join(DRAFTS_DIR, `${slug}.md`);
  if (!existsSync(p)) throw new Error(`No draft named "${slug}".`);
  return parse(slug, readFileSync(p, "utf8"));
}

export function saveDraft(
  slug: string,
  body: string,
  type: Draft["type"] = "post",
  status: Draft["status"] = "ready",
  scheduled_at?: string
): void {
  ensureDir();
  writeFileSync(
    join(DRAFTS_DIR, `${slug}.md`),
    serialize({ slug, type, status, scheduled_at, body })
  );
}

export function setStatus(slug: string, status: Draft["status"]): void {
  const d = readDraft(slug);
  d.status = status;
  writeFileSync(join(DRAFTS_DIR, `${slug}.md`), serialize(d));
}
