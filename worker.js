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

function successPage(tokens, idTokenPayload, userinfoData) {
  const tokenDisplay = {
    access_token: tokens.access_token ? tokens.access_token.slice(0, 20) + "..." : null,
    refresh_token: tokens.refresh_token ? tokens.refresh_token.slice(0, 20) + "..." : null,
    token_type: tokens.token_type,
    expires_in: tokens.expires_in,
    scope: tokens.scope,
  };

  return new Response(
    `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"><title>Auth Success</title>
  <style>
    body{font-family:system-ui,sans-serif;background:#f5f5f5;display:flex;justify-content:center;align-items:center;min-height:100vh}
    .card{background:#fff;border-radius:12px;box-shadow:0 2px 12px rgba(0,0,0,.1);padding:2.5rem;max-width:700px;width:100%}
    h1{color:#2e7d32;font-size:1.3rem;margin-bottom:.5rem}
    .sub{color:#666;margin-bottom:1.5rem}
    h2{font-size:1rem;color:#333;margin-top:1.5rem;margin-bottom:.5rem}
    pre{background:#fafafa;padding:1rem;border-radius:8px;overflow-x:auto;font-size:.82rem;white-space:pre-wrap;word-break:break-all}
    a{display:inline-block;margin-top:1.5rem;color:#0070f3}
  </style>
</head>
<body>
  <div class="card">
    <h1>Authorization Successful</h1>
    <p class="sub">Ory OAuth2 flow completed. Settings are working correctly.</p>
    <h2>Tokens received</h2>
    <pre>${JSON.stringify(tokenDisplay, null, 2)}</pre>
    <h2>ID Token claims</h2>
    <pre>${JSON.stringify(idTokenPayload, null, 2)}</pre>
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

  return new Response(null, {
    status: 302,
    headers: {
      Location: authUrl,
      "Set-Cookie": [
        setStateCookie("ory_demo_state", state),
        setStateCookie("ory_demo_verifier", codeVerifier),
      ].join(", "),
    },
  });
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

  // Decode id_token
  let idClaims = {};
  if (tokenData.id_token) {
    try {
      const payload = tokenData.id_token.split(".")[1];
      const padded = payload + "=".repeat((4 - (payload.length % 4)) % 4);
      idClaims = JSON.parse(atob(padded));
    } catch {
      idClaims = { note: "could not decode id_token" };
    }
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
  const response = successPage(tokenData, idClaims, userinfoData);
  response.headers.append("Set-Cookie", clearCookie("ory_demo_state"));
  response.headers.append("Set-Cookie", clearCookie("ory_demo_verifier"));
  return response;
}
