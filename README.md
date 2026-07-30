# linkedin-mcp

A personal MCP server for managing your LinkedIn content from Cursor.

**What it does via the API (self-serve, no partner approval):**
- Publish text posts, image posts, and document/carousel posts to your own feed.

**What it does locally (no API — this is where most of the value is):**
- Draft posts *and articles* as markdown files (git-friendly).
- Convert markdown → LinkedIn-ready text (unicode bold/italic, bullets, spacing).
- Lint posts (length, hook, hashtags).
- Track draft status (idea / ready / scheduled / published).

**What it cannot do (LinkedIn limitation, applies to everyone including Buffer):**
- Create or edit **articles** via API. Articles are web-editor-only. This tool
  gets your article draft *ready to paste*; you hit publish by hand.
- Read analytics, connections, or search (partner-gated).

Do **not** add browser-cookie automation to fake these — that's how accounts get banned.

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
        "LINKEDIN_DRAFTS_DIR": "/ABSOLUTE/PATH/TO/linkedin-drafts"
      }
    }
  }
}
```

Restart Cursor. You should see the `linkedin` tools available in chat.

## 5. Use it

- "Save this as a draft called grpc-mesh" → `save_draft`
- "Format grpc-mesh for LinkedIn" → `format_for_linkedin`
- "Lint it" → `lint_post`
- "Publish it" → `publish_text_post`
- For an article: `save_draft` with type=article, then `prepare_article_for_paste`,
  then paste into LinkedIn's **Write article** editor and publish manually.

## Notes

- `LINKEDIN_VERSION` in `src/config.ts` is `202605`. LinkedIn sunsets old
  versions periodically — bump it if calls start failing with a version error.
- Scheduling isn't wired yet (v2). The mechanism: store `scheduled_at` on a
  draft, run a small cron/launchd job that calls `publish_text_post` at that time.
  Your machine must be awake and online for it to fire.
