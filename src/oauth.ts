import { createServer } from "node:http";
import { URL } from "node:url";
import { exec } from "node:child_process";
import {
  CLIENT_ID,
  CLIENT_SECRET,
  REDIRECT_URI,
  SCOPES,
  saveToken,
} from "./config.js";

// Standalone one-time authorization. Run with: npm run auth
// Opens LinkedIn in your browser, you click "Allow", token gets saved locally.

function openBrowser(url: string) {
  const cmd =
    process.platform === "darwin"
      ? `open "${url}"`
      : process.platform === "win32"
        ? `start "" "${url}"`
        : `xdg-open "${url}"`;
  exec(cmd);
}

async function exchangeCodeForToken(code: string) {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: REDIRECT_URI,
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
  });

  const res = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) throw new Error(`Token exchange failed: ${await res.text()}`);
  return (await res.json()) as { access_token: string; expires_in: number };
}

async function fetchProfile(accessToken: string) {
  // OpenID userinfo endpoint returns `sub` (your member id) + name.
  const res = await fetch("https://api.linkedin.com/v2/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`userinfo failed: ${await res.text()}`);
  return (await res.json()) as { sub: string; name?: string };
}

async function main() {
  if (!CLIENT_ID || !CLIENT_SECRET) {
    console.error(
      "Set LINKEDIN_CLIENT_ID and LINKEDIN_CLIENT_SECRET env vars first (see README)."
    );
    process.exit(1);
  }

  const state = Math.random().toString(36).slice(2);
  const authUrl = new URL("https://www.linkedin.com/oauth/v2/authorization");
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("client_id", CLIENT_ID);
  authUrl.searchParams.set("redirect_uri", REDIRECT_URI);
  authUrl.searchParams.set("scope", SCOPES.join(" "));
  authUrl.searchParams.set("state", state);

  const port = Number(new URL(REDIRECT_URI).port || 8765);

  const server = createServer(async (req, res) => {
    const u = new URL(req.url ?? "", `http://localhost:${port}`);
    if (u.pathname !== "/callback") {
      res.writeHead(404).end();
      return;
    }
    const code = u.searchParams.get("code");
    const returnedState = u.searchParams.get("state");
    if (!code || returnedState !== state) {
      res.writeHead(400).end("Bad request or state mismatch.");
      return;
    }
    try {
      const tok = await exchangeCodeForToken(code);
      const prof = await fetchProfile(tok.access_token);
      saveToken({
        access_token: tok.access_token,
        expires_at: Date.now() + tok.expires_in * 1000,
        person_urn: `urn:li:person:${prof.sub}`,
        name: prof.name,
      });
      res.writeHead(200, { "Content-Type": "text/html" }).end(
        `<h2>Authorized as ${prof.name ?? "you"}. You can close this tab.</h2>`
      );
      console.log(`\nSaved token for ${prof.name ?? prof.sub}. Done.`);
    } catch (e) {
      res.writeHead(500).end(String(e));
      console.error(e);
    } finally {
      setTimeout(() => server.close(() => process.exit(0)), 500);
    }
  });

  server.listen(port, () => {
    console.log(`Opening LinkedIn authorization in your browser...`);
    console.log(`If it doesn't open, visit:\n${authUrl.toString()}\n`);
    openBrowser(authUrl.toString());
  });
}

main();
