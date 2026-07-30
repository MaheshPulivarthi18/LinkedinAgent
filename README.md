# linkedin-mcp

A personal LinkedIn career copilot — MCP server for managing your LinkedIn
content, profile, resume, and job-search outreach from Cursor.

**What it does via the API (self-serve, no partner approval):**
- Publish text posts, image posts, and document/carousel posts to your own feed.

**What it does locally (no API — this is where most of the value is):**
- Draft posts *and articles* as markdown files (git-friendly).
- Convert markdown → LinkedIn-ready text (unicode bold/italic, bullets, spacing).
- Lint posts (length, hook, hashtags).
- Track draft status (idea / ready / scheduled / published).
- Draft and iterate on profile copy (headline, About, skills, featured) with
  LinkedIn's real character limits enforced.
- Keep a master resume plus tailored versions per job/company.
- Track outreach: draft connection-request and follow-up messages, and log
  where each conversation stands (to_contact / contacted / replied / interview / closed).

**What it deliberately does NOT do, and why:**
- **No auto-connecting, searching, or reading other people's profiles/connections.**
  LinkedIn does not expose this to individual developers — it's gated behind
  their Talent/Marketing Partner program, which isn't self-serve. The only way
  around that is browser automation or scraping, which is how accounts get
  banned. This tool won't do it. You decide who to contact and you hit send —
  the tool just kills the blank-page problem and keeps you organized.
- **No profile writes via API.** LinkedIn has no developer API for editing your
  headline/About/experience. The profile tools here draft and lint text for
  you to paste in yourself.
- **No article publishing via API.** Articles are web-editor-only for
  everyone (including tools like Buffer). This gets your draft *ready to
  paste*; you hit publish by hand.
- **No analytics.** Also partner-gated.

---

## 1. Create a LinkedIn app

1. Go to https://www.linkedin.com/developers/apps → **Create app**.
2. Associate it with a Company Page (required; make a throwaway page if needed).
3. Under **Products**, add **"Share on LinkedIn"** and **"Sign In with LinkedIn using OpenID Connect"**. These are self-serve — no approval wait.
4. Under **Auth**, add redirect URL: `http://localhost:8765/callback`.
5. Copy your **Client ID** and **Client Secret**.

Your app should end up with scopes: `openid profile email w_member_social`.

## 2. Install & build

```bash
cd linkedin-mcp
npm install
npm run build
```

## 3. Authorize once

```bash
LINKEDIN_CLIENT_ID=xxx LINKEDIN_CLIENT_SECRET=yyy npm run auth
```

A browser opens → click **Allow** → token is saved to `~/.linkedin-mcp/token.json`.
(Tokens last ~60 days; re-run `npm run auth` when it expires.)

## 4. Wire into Cursor

Cursor → Settings → **MCP** → add a server. Or edit `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "linkedin": {
      "command": "node",
      "args": ["/ABSOLUTE/PATH/TO/linkedin-mcp/dist/index.js"],
      "env": {
        "LINKEDIN_CLIENT_ID": "xxx",
        "LINKEDIN_CLIENT_SECRET": "yyy",
        "LINKEDIN_DRAFTS_DIR": "/ABSOLUTE/PATH/TO/linkedin-drafts",
        "LINKEDIN_PROFILE_DIR": "/ABSOLUTE/PATH/TO/linkedin-profile",
        "LINKEDIN_RESUME_DIR": "/ABSOLUTE/PATH/TO/linkedin-resumes",
        "LINKEDIN_OUTREACH_DIR": "/ABSOLUTE/PATH/TO/linkedin-outreach"
      }
    }
  }
}
```

Restart Cursor. You should see the `linkedin` tools available in chat.

## 5. Use it

**Content**
- "Save this as a draft called grpc-mesh" → `save_draft`
- "Format grpc-mesh for LinkedIn" → `format_for_linkedin`
- "Lint it" → `lint_post`
- "Publish it" → `publish_text_post`
- For an article: `save_draft` with type=article, then `prepare_article_for_paste`,
  then paste into LinkedIn's **Write article** editor and publish manually.

**Profile**
- "Tighten my headline for keyword search" → paste current text, get a rewrite,
  `save_profile_section` → `lint_profile_section` → paste into LinkedIn →
  `set_profile_section_status` to `current`.

**Resume**
- `save_master_resume` once, then per job: `save_tailored_resume` with the
  company/role, iterate, `set_tailored_resume_status` to `sent` once submitted.

**Outreach**
- `save_contact` for someone you want to reach out to, draft a note, `log_outreach_message`,
  send it yourself on LinkedIn, then `set_contact_status` as the conversation progresses.

## Notes

- `LINKEDIN_VERSION` in `src/config.ts` is `202605`. LinkedIn sunsets old
  versions periodically — bump it if calls start failing with a version error.
- Scheduling isn't wired yet (v2). The mechanism: store `scheduled_at` on a
  draft, run a small cron/launchd job that calls `publish_text_post` at that time.
  Your machine must be awake and online for it to fire.
