import {
  readFileSync,
  writeFileSync,
  readdirSync,
  existsSync,
  mkdirSync,
} from "node:fs";
import { join } from "node:path";
import { OUTREACH_DIR } from "./config.js";

// A personal outreach CRM, entirely local — no LinkedIn connection/search
// API exists for developers, and automating sends would risk the account.
// You decide who to contact and hit send yourself; this just kills the
// blank-page problem and keeps track of where each conversation stands.
// One markdown file per contact, front matter: name, company, role, status.

function ensureDir() {
  if (!existsSync(OUTREACH_DIR)) mkdirSync(OUTREACH_DIR, { recursive: true });
}

export type ContactStatus = "to_contact" | "contacted" | "replied" | "interview" | "closed";

export interface Contact {
  slug: string;
  name: string;
  company: string;
  role: string;
  status: ContactStatus;
  updated_at: string;
  body: string; // notes + drafted/sent messages, freeform
}

function parse(slug: string, raw: string): Contact {
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
    name: meta.name ?? "",
    company: meta.company ?? "",
    role: meta.role ?? "",
    status: (meta.status as ContactStatus) ?? "to_contact",
    updated_at: meta.updated_at ?? new Date().toISOString(),
    body: body.trim(),
  };
}

function serialize(c: Contact): string {
  const fm = [
    "---",
    `name: ${c.name}`,
    `company: ${c.company}`,
    `role: ${c.role}`,
    `status: ${c.status}`,
    `updated_at: ${c.updated_at}`,
    "---",
    "",
  ].join("\n");
  return fm + c.body.trim() + "\n";
}

function path(slug: string) {
  return join(OUTREACH_DIR, `${slug}.md`);
}

export function saveContact(
  slug: string,
  name: string,
  company: string,
  role: string,
  notes = ""
): void {
  ensureDir();
  const existing = existsSync(path(slug)) ? parse(slug, readFileSync(path(slug), "utf8")) : undefined;
  writeFileSync(
    path(slug),
    serialize({
      slug,
      name,
      company,
      role,
      status: existing?.status ?? "to_contact",
      updated_at: new Date().toISOString(),
      body: notes || existing?.body || "",
    })
  );
}

export function readContact(slug: string): Contact {
  if (!existsSync(path(slug))) throw new Error(`No contact named "${slug}".`);
  return parse(slug, readFileSync(path(slug), "utf8"));
}

export function listContacts(): Contact[] {
  ensureDir();
  return readdirSync(OUTREACH_DIR)
    .filter((f) => f.endsWith(".md"))
    .map((f) => parse(f.replace(/\.md$/, ""), readFileSync(join(OUTREACH_DIR, f), "utf8")));
}

export function setContactStatus(slug: string, status: ContactStatus): void {
  const c = readContact(slug);
  c.status = status;
  c.updated_at = new Date().toISOString();
  writeFileSync(path(slug), serialize(c));
}

/** Append a drafted or sent message to a contact's history, timestamped. */
export function logMessage(slug: string, message: string): void {
  const c = readContact(slug);
  const stamp = new Date().toISOString();
  c.body = `${c.body}\n\n### ${stamp}\n${message.trim()}`.trim();
  c.updated_at = stamp;
  writeFileSync(path(slug), serialize(c));
}
