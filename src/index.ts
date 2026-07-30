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
  listProfileSections,
  readProfileSection,
  saveProfileSection,
  setProfileSectionStatus,
  lintProfileSection,
} from "./profile.js";
import {
  saveMasterResume,
  readMasterResume,
  saveTailoredResume,
  readTailoredResume,
  listTailoredResumes,
  setTailoredResumeStatus,
} from "./resume.js";
import {
  saveContact,
  readContact,
  listContacts,
  setContactStatus,
  logMessage,
} from "./outreach.js";

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

/* ---------- PROFILE OPTIMIZER (local — LinkedIn has no profile-write API) ---------- */

server.tool(
  "list_profile_sections",
  "List all tracked profile sections (headline, about, skills, etc.) with status.",
  {},
  async () => {
    const secs = listProfileSections();
    if (!secs.length) return text("No profile sections tracked yet.");
    return text(secs.map((s) => `${s.section} [${s.status}] (updated ${s.updated_at})`).join("\n"));
  }
);

server.tool(
  "read_profile_section",
  "Read a tracked profile section's current text.",
  { section: z.string().describe("e.g. headline, about, skills, featured.") },
  async ({ section }) => {
    const s = readProfileSection(section);
    return text(`[${s.status}]\n\n${s.body}`);
  }
);

server.tool(
  "save_profile_section",
  "Save a profile section draft (e.g. after rewriting a headline or About for keyword strength). You still paste the result into LinkedIn by hand.",
  {
    section: z.string().describe("e.g. headline, about, skills, featured."),
    body: z.string(),
    status: z.enum(["draft", "current"]).default("draft"),
  },
  async ({ section, body, status }) => {
    saveProfileSection(section, body, status);
    return text(`Saved "${section}" as ${status}.`);
  }
);

server.tool(
  "set_profile_section_status",
  "Mark a profile section as 'current' once you've pasted it into LinkedIn, or 'draft' while iterating.",
  { section: z.string(), status: z.enum(["draft", "current"]) },
  async ({ section, status }) => {
    setProfileSectionStatus(section, status);
    return text(`"${section}" is now ${status}.`);
  }
);

server.tool(
  "lint_profile_section",
  "Check a profile section against LinkedIn's real character limits (headline 220, about/featured 2600).",
  { section: z.string(), text: z.string() },
  async (args) => {
    const r = lintProfileSection(args.section, args.text);
    return text(
      `chars: ${r.charCount}${r.limit ? `/${r.limit}` : ""}\nok: ${r.ok}\n${r.warnings.map((w) => "- " + w).join("\n") || "no warnings"}`
    );
  }
);

/* ---------- RESUME TAILORING (local, git-friendly versions) ---------- */

server.tool(
  "save_master_resume",
  "Save/overwrite your master resume — the base every tailored version is built from.",
  { body: z.string() },
  async ({ body }) => {
    saveMasterResume(body);
    return text("Saved master resume.");
  }
);

server.tool(
  "read_master_resume",
  "Read your master resume.",
  {},
  async () => text(readMasterResume())
);

server.tool(
  "save_tailored_resume",
  "Save a resume version tailored to a specific job/company.",
  {
    slug: z.string().describe("Filename-safe id, e.g. acme-staff-swe."),
    body: z.string(),
    company: z.string(),
    role: z.string(),
    status: z.enum(["draft", "sent"]).default("draft"),
  },
  async ({ slug, body, company, role, status }) => {
    saveTailoredResume(slug, body, company, role, status);
    return text(`Saved tailored resume "${slug}" for ${role} at ${company} (${status}).`);
  }
);

server.tool(
  "read_tailored_resume",
  "Read a tailored resume by slug.",
  { slug: z.string() },
  async ({ slug }) => {
    const t = readTailoredResume(slug);
    return text(`[${t.company} — ${t.role} — ${t.status}]\n\n${t.body}`);
  }
);

server.tool(
  "list_tailored_resumes",
  "List all tailored resume versions with company/role/status.",
  {},
  async () => {
    const ts = listTailoredResumes();
    if (!ts.length) return text("No tailored resumes yet.");
    return text(ts.map((t) => `${t.slug}: ${t.role} @ ${t.company} [${t.status}]`).join("\n"));
  }
);

server.tool(
  "set_tailored_resume_status",
  "Mark a tailored resume as draft or sent.",
  { slug: z.string(), status: z.enum(["draft", "sent"]) },
  async ({ slug, status }) => {
    setTailoredResumeStatus(slug, status);
    return text(`"${slug}" is now ${status}.`);
  }
);

/* ---------- OUTREACH TRACKER (local CRM — no auto-sending, no scraping) ---------- */

server.tool(
  "save_contact",
  "Create or update a contact you plan to reach out to on LinkedIn.",
  {
    slug: z.string().describe("Filename-safe id, e.g. jane-doe-acme."),
    name: z.string(),
    company: z.string(),
    role: z.string(),
    notes: z.string().default(""),
  },
  async ({ slug, name, company, role, notes }) => {
    saveContact(slug, name, company, role, notes);
    return text(`Saved contact "${slug}".`);
  }
);

server.tool(
  "read_contact",
  "Read a contact's details and message history.",
  { slug: z.string() },
  async ({ slug }) => {
    const c = readContact(slug);
    return text(`${c.name} — ${c.role} @ ${c.company} [${c.status}]\n\n${c.body}`);
  }
);

server.tool(
  "list_contacts",
  "List all tracked contacts with status.",
  {},
  async () => {
    const cs = listContacts();
    if (!cs.length) return text("No contacts yet.");
    return text(cs.map((c) => `${c.slug}: ${c.name} @ ${c.company} [${c.status}]`).join("\n"));
  }
);

server.tool(
  "set_contact_status",
  "Update a contact's status (to_contact/contacted/replied/interview/closed).",
  {
    slug: z.string(),
    status: z.enum(["to_contact", "contacted", "replied", "interview", "closed"]),
  },
  async ({ slug, status }) => {
    setContactStatus(slug, status);
    return text(`"${slug}" is now ${status}.`);
  }
);

server.tool(
  "log_outreach_message",
  "Save a drafted or sent message to a contact's history, timestamped. You send it yourself on LinkedIn.",
  { slug: z.string(), message: z.string() },
  async ({ slug, message }) => {
    logMessage(slug, message);
    return text(`Logged message for "${slug}".`);
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
