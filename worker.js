// ── Ory Auth Demo — Cloudflare Worker ─────────────────────────────────
// Minimal OAuth2 Authorization Code + PKCE flow against Ory.
// Demonstrates that Ory client settings work correctly.

// ── PKCE helpers ──────────────────────────────────────────────────────

function base64urlEncode(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function generateCodeVerifier() {
  return base64urlEncode(crypto.getRandomValues(new Uint8Array(32)));
}

async function generateCodeChallenge(verifier) {
  const data = new TextEncoder().encode(verifier);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return base64urlEncode(hash);
}

function generateState() {
  return base64urlEncode(crypto.getRandomValues(new Uint8Array(16)));
}

// ── HTML pages ────────────────────────────────────────────────────────

function homePage(env, baseUrl) {
  const hasSecret = !!env.ORY_CLIENT_SECRET;
  return new Response(
    `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"><title>Ory Auth Demo</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:system-ui,sans-serif;background:#f5f5f5;display:flex;justify-content:center;align-items:center;min-height:100vh}
    .card{background:#fff;border-radius:12px;box-shadow:0 2px 12px rgba(0,0,0,.1);padding:2.5rem;max-width:520px;width:100%}
    h1{font-size:1.4rem;margin-bottom:1rem}
    .p{font-size:.85rem;color:#555;margin-bottom:.3rem;word-break:break-all}
    .p b{color:#333}
    .btn{display:inline-block;margin-top:1.5rem;padding:.75rem 1.5rem;background:#0070f3;color:#fff;text-decoration:none;border-radius:8px;font-size:1rem}
    .btn:hover{background:#005bb5}
    .warn{background:#fff3cd;border:1px solid #ffc107;border-radius:8px;padding:.75rem;margin-top:1rem;font-size:.85rem;color:#856404}
  </style>
</head>
<body>
  <div class="card">
    <h1>Ory OAuth2 Demo</h1>
    <div class="p"><b>Ory Project:</b> ${env.ORY_PROJECT_URL}</div>
    <div class="p"><b>Client ID:</b> ${env.ORY_CLIENT_ID}</div>
    <div class="p"><b>Redirect URI:</b> ${baseUrl}/callback</div>
    <div class="p"><b>Scopes:</b> openid offline_access</div>
    <div class="p"><b>Client Secret:</b> ${hasSecret ? "configured" : "NOT SET"}</div>
    ${!hasSecret ? '<div class="warn">ORY_CLIENT_SECRET not set. Run: <code>npx wrangler secret put ORY_CLIENT_SECRET</code></div>' : ""}
    <a class="btn" href="/login">Login with Ory</a>
  </div>
</body>
</html>`,
    { headers: { "Content-Type": "text/html;charset=utf-8" } }
  );
}

function errorPage(title, detail) {
  return new Response(
    `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"><title>Auth Error</title>
  <style>
    body{font-family:system-ui,sans-serif;background:#f5f5f5;display:flex;justify-content:center;align-items:center;min-height:100vh}
    .card{background:#fff;border-radius:12px;box-shadow:0 2px 12px rgba(0,0,0,.1);padding:2.5rem;max-width:600px;width:100%}
    h1{color:#d32f2f;font-size:1.3rem;margin-bottom:1rem}
    pre{background:#fafafa;padding:1rem;border-radius:8px;overflow-x:auto;font-size:.85rem;white-space:pre-wrap;word-break:break-all}
    a{display:inline-block;margin-top:1rem;color:#0070f3}
  </style>
</head>
<body>
  <div class="card">
    <h1>${title}</h1>
    <pre>${detail}</pre>
    <a href="/">Try again</a>
  </div>
</body>
</html>`,
    { status: 400, headers: { "Content-Type": "text/html;charset=utf-8" } }
  );
}

function decodeJwtParts(jwt) {
  if (!jwt) return null;
  try {
    const parts = jwt.split(".");
    const decode = (s) => {
      const padded = s + "=".repeat((4 - (s.length % 4)) % 4);
      return JSON.parse(atob(padded));
    };
    return { header: decode(parts[0]), payload: decode(parts[1]) };
  } catch {
    return null;
  }
}

function successPage(tokens, userinfoData) {
  const tokenMeta = {
    token_type: tokens.token_type,
    expires_in: tokens.expires_in,
    scope: tokens.scope,
  };

  const accessDecoded = decodeJwtParts(tokens.access_token);
  const idDecoded = decodeJwtParts(tokens.id_token);

  return new Response(
    `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"><title>Auth Success</title>
  <style>
    body{font-family:system-ui,sans-serif;background:#f5f5f5;display:flex;justify-content:center;align-items:center;min-height:100vh;padding:2rem 1rem}
    .card{background:#fff;border-radius:12px;box-shadow:0 2px 12px rgba(0,0,0,.1);padding:2.5rem;max-width:900px;width:100%}
    h1{color:#2e7d32;font-size:1.3rem;margin-bottom:.5rem}
    .sub{color:#666;margin-bottom:1.5rem}
    h2{font-size:1rem;color:#333;margin-top:1.5rem;margin-bottom:.5rem}
    h3{font-size:.9rem;color:#555;margin-top:1rem;margin-bottom:.3rem}
    pre{background:#fafafa;padding:1rem;border-radius:8px;overflow-x:auto;font-size:.82rem;white-space:pre-wrap;word-break:break-all}
    .raw-token{background:#1e1e1e;color:#d4d4d4;padding:1rem;border-radius:8px;font-size:.75rem;white-space:pre-wrap;word-break:break-all;max-height:120px;overflow-y:auto}
    .jwt-parts{display:flex;flex-direction:column;gap:.5rem}
    .jwt-header{background:#e3f2fd;padding:.75rem;border-radius:6px;font-size:.82rem;white-space:pre-wrap;word-break:break-all}
    .jwt-payload{background:#f3e5f5;padding:.75rem;border-radius:6px;font-size:.82rem;white-space:pre-wrap;word-break:break-all}
    a{display:inline-block;margin-top:1.5rem;color:#0070f3}
    .section{border:1px solid #e0e0e0;border-radius:8px;padding:1rem;margin-top:1rem}
    .label{font-size:.75rem;color:#888;text-transform:uppercase;letter-spacing:.05em;margin-bottom:.3rem}
  </style>
</head>
<body>
  <div class="card">
    <h1>Authorization Successful</h1>
    <p class="sub">Ory OAuth2 flow completed. Settings are working correctly.</p>

    <h2>Token metadata</h2>
    <pre>${JSON.stringify(tokenMeta, null, 2)}</pre>

    ${tokens.access_token ? `
    <div class="section">
      <h2>Access Token</h2>
      <div class="label">Raw JWT</div>
      <div class="raw-token">${tokens.access_token}</div>
      ${accessDecoded ? `
      <div class="jwt-parts">
        <div>
          <div class="label">Header</div>
          <div class="jwt-header">${JSON.stringify(accessDecoded.header, null, 2)}</div>
        </div>
        <div>
          <div class="label">Payload</div>
          <div class="jwt-payload">${JSON.stringify(accessDecoded.payload, null, 2)}</div>
        </div>
      </div>` : `<p style="color:#888;font-size:.85rem;margin-top:.5rem">Opaque token (not a JWT)</p>`}
    </div>` : ""}

    ${tokens.id_token ? `
    <div class="section">
      <h2>ID Token</h2>
      <div class="label">Raw JWT</div>
      <div class="raw-token">${tokens.id_token}</div>
      ${idDecoded ? `
      <div class="jwt-parts">
        <div>
          <div class="label">Header</div>
          <div class="jwt-header">${JSON.stringify(idDecoded.header, null, 2)}</div>
        </div>
        <div>
          <div class="label">Payload (Claims)</div>
          <div class="jwt-payload">${JSON.stringify(idDecoded.payload, null, 2)}</div>
        </div>
      </div>` : ""}
    </div>` : ""}

    ${tokens.refresh_token ? `
    <div class="section">
      <h2>Refresh Token</h2>
      <div class="label">Raw token</div>
      <div class="raw-token">${tokens.refresh_token}</div>
    </div>` : ""}

    ${userinfoData ? `<h2>UserInfo endpoint</h2><pre>${JSON.stringify(userinfoData, null, 2)}</pre>` : ""}
    <a href="/">Back to home</a>
  </div>
</body>
</html>`,
    { headers: { "Content-Type": "text/html;charset=utf-8" } }
  );
}

// ── Cookie helpers (state storage without KV) ─────────────────────────

function setStateCookie(name, value, maxAge = 600) {
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=${maxAge}`;
}

function getStateCookie(request, name) {
  const cookie = request.headers.get("Cookie") || "";
  const match = cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

function clearCookie(name) {
  return `${name}=; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=0`;
}

// ── Request handler ───────────────────────────────────────────────────

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const baseUrl = url.origin;

    try {
      switch (url.pathname) {
        case "/":
          return homePage(env, baseUrl);

        case "/login":
          return handleLogin(env, baseUrl);

        case "/callback":
          return handleCallback(request, env, baseUrl);

        default:
          return new Response("Not found", { status: 404 });
      }
    } catch (err) {
      console.error("Unhandled error:", err);
      return errorPage("Server Error", err.message);
    }
  },
};

// ── /login — start OAuth2 flow ────────────────────────────────────────

async function handleLogin(env, baseUrl) {
  const state = generateState();
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = await generateCodeChallenge(codeVerifier);

  const params = new URLSearchParams({
    client_id: env.ORY_CLIENT_ID,
    response_type: "code",
    redirect_uri: `${baseUrl}/callback`,
    scope: "openid offline_access",
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  });

  const authUrl = `${env.ORY_PROJECT_URL}/oauth2/auth?${params}`;

  const response = new Response(null, {
    status: 302,
    headers: { Location: authUrl },
  });
  response.headers.append("Set-Cookie", setStateCookie("ory_demo_state", state));
  response.headers.append("Set-Cookie", setStateCookie("ory_demo_verifier", codeVerifier));
  return response;
}

// ── /callback — handle Ory redirect ───────────────────────────────────

async function handleCallback(request, env, baseUrl) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");
  const errorDesc = url.searchParams.get("error_description");

  if (error) {
    return errorPage("Ory returned an error", `${error}: ${errorDesc || "no details"}`);
  }

  // Verify state
  const savedState = getStateCookie(request, "ory_demo_state");
  const codeVerifier = getStateCookie(request, "ory_demo_verifier");

  if (!state || state !== savedState) {
    return errorPage("Invalid state", "State mismatch. Session may have expired. Try again.");
  }

  if (!codeVerifier) {
    return errorPage("Missing PKCE verifier", "Session cookie lost. Try again.");
  }

  // Exchange code for tokens
  const tokenUrl = `${env.ORY_PROJECT_URL}/oauth2/token`;
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: `${baseUrl}/callback`,
    code_verifier: codeVerifier,
  });

  const headers = { "Content-Type": "application/x-www-form-urlencoded" };
  if (env.ORY_CLIENT_SECRET) {
    headers["Authorization"] =
      "Basic " + btoa(`${env.ORY_CLIENT_ID}:${env.ORY_CLIENT_SECRET}`);
  } else {
    body.set("client_id", env.ORY_CLIENT_ID);
  }

  const tokenRes = await fetch(tokenUrl, {
    method: "POST",
    headers,
    body: body.toString(),
  });

  const tokenData = await tokenRes.json();

  if (!tokenRes.ok) {
    return errorPage(
      "Token exchange failed",
      `HTTP ${tokenRes.status}\n${JSON.stringify(tokenData, null, 2)}`
    );
  }

  // Fetch /userinfo
  let userinfoData = null;
  try {
    const uiRes = await fetch(`${env.ORY_PROJECT_URL}/userinfo`, {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    if (uiRes.ok) userinfoData = await uiRes.json();
  } catch { /* ignore */ }

  // Clear cookies and show result
  const response = successPage(tokenData, userinfoData);
  response.headers.append("Set-Cookie", clearCookie("ory_demo_state"));
  response.headers.append("Set-Cookie", clearCookie("ory_demo_verifier"));
  return response;
}
