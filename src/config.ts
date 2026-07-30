import { homedir } from "node:os";
import { join } from "node:path";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";

// Where we keep the OAuth token + your person URN. Lives in your home dir,
// NOT in the repo, so it never gets committed.
const CONFIG_DIR = join(homedir(), ".linkedin-mcp");
const TOKEN_PATH = join(CONFIG_DIR, "token.json");

// LinkedIn requires a version header on every /rest call, format YYYYMM.
// Bump this occasionally; LinkedIn sunsets old versions.
export const LINKEDIN_VERSION = "202605";

// Self-serve scopes. openid+profile give you your member id; w_member_social
// lets you publish. No partner approval needed for these.
export const SCOPES = ["openid", "profile", "email", "w_member_social"];

// Read from environment. Set these in your MCP server config (see README).
export const CLIENT_ID = process.env.LINKEDIN_CLIENT_ID ?? "";
export const CLIENT_SECRET = process.env.LINKEDIN_CLIENT_SECRET ?? "";
export const REDIRECT_URI =
  process.env.LINKEDIN_REDIRECT_URI ?? "http://localhost:8765/callback";

// Where your local markdown drafts live.
export const DRAFTS_DIR =
  process.env.LINKEDIN_DRAFTS_DIR ?? join(homedir(), "linkedin-drafts");

// Where profile-section drafts (headline/about/skills/etc) live.
export const PROFILE_DIR =
  process.env.LINKEDIN_PROFILE_DIR ?? join(homedir(), "linkedin-profile");

// Where your master + tailored resumes live.
export const RESUME_DIR =
  process.env.LINKEDIN_RESUME_DIR ?? join(homedir(), "linkedin-resumes");

// Where outreach/contact tracking lives.
export const OUTREACH_DIR =
  process.env.LINKEDIN_OUTREACH_DIR ?? join(homedir(), "linkedin-outreach");

export interface StoredToken {
  access_token: string;
  expires_at: number; // epoch ms
  person_urn: string; // urn:li:person:XXXX
  name?: string;
}

export function saveToken(t: StoredToken): void {
  if (!existsSync(CONFIG_DIR)) mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(TOKEN_PATH, JSON.stringify(t, null, 2), { mode: 0o600 });
}

export function loadToken(): StoredToken {
  if (!existsSync(TOKEN_PATH)) {
    throw new Error(
      "No token found. Run `npm run auth` once to authorize with LinkedIn."
    );
  }
  const t = JSON.parse(readFileSync(TOKEN_PATH, "utf8")) as StoredToken;
  if (Date.now() > t.expires_at) {
    throw new Error(
      "LinkedIn token has expired. Run `npm run auth` again to re-authorize."
    );
  }
  return t;
}
