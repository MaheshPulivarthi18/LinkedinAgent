import {
  readFileSync,
  writeFileSync,
  readdirSync,
  existsSync,
  mkdirSync,
} from "node:fs";
import { join } from "node:path";
import { RESUME_DIR } from "./config.js";

// Master resume + per-job tailored versions, kept as git-friendly markdown.
// RESUME_DIR/master.md — your base resume.
// RESUME_DIR/tailored/<slug>.md — one per job, front matter: company, role, status.

function ensureDirs() {
  if (!existsSync(RESUME_DIR)) mkdirSync(RESUME_DIR, { recursive: true });
  const tailoredDir = join(RESUME_DIR, "tailored");
  if (!existsSync(tailoredDir)) mkdirSync(tailoredDir, { recursive: true });
}

const MASTER_PATH = () => join(RESUME_DIR, "master.md");
const tailoredPath = (slug: string) => join(RESUME_DIR, "tailored", `${slug}.md`);

export function saveMasterResume(body: string): void {
  ensureDirs();
  writeFileSync(MASTER_PATH(), body.trim() + "\n");
}

export function readMasterResume(): string {
  ensureDirs();
  if (!existsSync(MASTER_PATH()))
    throw new Error('No master resume saved yet. Use save_master_resume first.');
  return readFileSync(MASTER_PATH(), "utf8");
}

export interface TailoredResume {
  slug: string;
  company: string;
  role: string;
  status: "draft" | "sent";
  updated_at: string;
  body: string;
}

function parse(slug: string, raw: string): TailoredResume {
  const m = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  const meta: Record<string, string> = {};
  let body = raw;
  if (m) {
    for (const line of m[1].split("\n")) {
      const idx = line.indexOf(":");
      if (idx > -1) meta[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
    }
    body = m[2];
  }
  return {
    slug,
    company: meta.company ?? "",
    role: meta.role ?? "",
    status: (meta.status as TailoredResume["status"]) ?? "draft",
    updated_at: meta.updated_at ?? new Date().toISOString(),
    body: body.trim(),
  };
}

function serialize(t: TailoredResume): string {
  const fm = [
    "---",
    `company: ${t.company}`,
    `role: ${t.role}`,
    `status: ${t.status}`,
    `updated_at: ${t.updated_at}`,
    "---",
    "",
  ].join("\n");
  return fm + t.body.trim() + "\n";
}

export function saveTailoredResume(
  slug: string,
  body: string,
  company: string,
  role: string,
  status: TailoredResume["status"] = "draft"
): void {
  ensureDirs();
  writeFileSync(
    tailoredPath(slug),
    serialize({ slug, company, role, status, updated_at: new Date().toISOString(), body })
  );
}

export function readTailoredResume(slug: string): TailoredResume {
  const p = tailoredPath(slug);
  if (!existsSync(p)) throw new Error(`No tailored resume named "${slug}".`);
  return parse(slug, readFileSync(p, "utf8"));
}

export function listTailoredResumes(): TailoredResume[] {
  ensureDirs();
  return readdirSync(join(RESUME_DIR, "tailored"))
    .filter((f) => f.endsWith(".md"))
    .map((f) => parse(f.replace(/\.md$/, ""), readFileSync(join(RESUME_DIR, "tailored", f), "utf8")));
}

export function setTailoredResumeStatus(slug: string, status: TailoredResume["status"]): void {
  const t = readTailoredResume(slug);
  t.status = status;
  t.updated_at = new Date().toISOString();
  writeFileSync(tailoredPath(slug), serialize(t));
}
