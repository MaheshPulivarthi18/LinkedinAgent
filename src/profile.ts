import {
  readFileSync,
  writeFileSync,
  readdirSync,
  existsSync,
  mkdirSync,
} from "node:fs";
import { join } from "node:path";
import { PROFILE_DIR } from "./config.js";

// LinkedIn has no profile-write API for developers, so this is a local
// drafting/optimization workspace: you paste your current section in, get
// a tightened rewrite, then paste the result back into LinkedIn by hand.
// One markdown file per section (headline/about/skills/featured/...),
// front matter: status (draft|current), updated_at.

function ensureDir() {
  if (!existsSync(PROFILE_DIR)) mkdirSync(PROFILE_DIR, { recursive: true });
}

// LinkedIn's actual field limits — used by lintProfileSection below.
const LIMITS: Record<string, number> = {
  headline: 220,
  about: 2600,
  featured: 2600,
};

export interface ProfileSection {
  section: string;
  status: "draft" | "current";
  updated_at: string;
  body: string;
}

function parse(section: string, raw: string): ProfileSection {
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
    section,
    status: (meta.status as ProfileSection["status"]) ?? "draft",
    updated_at: meta.updated_at ?? new Date().toISOString(),
    body: body.trim(),
  };
}

function serialize(p: ProfileSection): string {
  const fm = ["---", `status: ${p.status}`, `updated_at: ${p.updated_at}`, "---", ""].join("\n");
  return fm + p.body.trim() + "\n";
}

export function listProfileSections(): ProfileSection[] {
  ensureDir();
  return readdirSync(PROFILE_DIR)
    .filter((f) => f.endsWith(".md"))
    .map((f) => parse(f.replace(/\.md$/, ""), readFileSync(join(PROFILE_DIR, f), "utf8")));
}

export function readProfileSection(section: string): ProfileSection {
  const p = join(PROFILE_DIR, `${section}.md`);
  if (!existsSync(p)) throw new Error(`No profile section named "${section}".`);
  return parse(section, readFileSync(p, "utf8"));
}

export function saveProfileSection(
  section: string,
  body: string,
  status: ProfileSection["status"] = "draft"
): void {
  ensureDir();
  writeFileSync(
    join(PROFILE_DIR, `${section}.md`),
    serialize({ section, status, updated_at: new Date().toISOString(), body })
  );
}

export function setProfileSectionStatus(section: string, status: ProfileSection["status"]): void {
  const p = readProfileSection(section);
  p.status = status;
  p.updated_at = new Date().toISOString();
  writeFileSync(join(PROFILE_DIR, `${section}.md`), serialize(p));
}

export interface LintResult {
  ok: boolean;
  charCount: number;
  limit?: number;
  warnings: string[];
}

export function lintProfileSection(section: string, text: string): LintResult {
  const charCount = [...text].length;
  const limit = LIMITS[section];
  const warnings: string[] = [];
  if (limit && charCount > limit)
    warnings.push(`Over LinkedIn's ${limit}-char limit for "${section}" (${charCount}).`);
  if (charCount < 3) warnings.push("Looks empty.");
  return { ok: warnings.length === 0, charCount, limit, warnings };
}
