# ory-test

Demo app to verify Ory OAuth2 settings. Replicates the digital-twin-mcp authorization flow (Authorization Code + PKCE) but does nothing — just shows that auth succeeded.

## Structure

```
worker.js      — CF Worker: OAuth2 + PKCE directly to Ory
wrangler.toml  — config (ORY_PROJECT_URL, ORY_CLIENT_ID)
package.json   — wrangler dev / deploy
```

## Ory parameters

All parameters are provided via environment variables (no hardcoded defaults):

| Variable | Description |
|---|---|
| `ORY_PROJECT_URL` | Ory project URL, e.g. `https://your-project.projects.oryapis.com` |
| `ORY_CLIENT_ID` | OAuth2 client ID registered in Ory |
| `ORY_CLIENT_SECRET` | OAuth2 client secret (for confidential clients) |

- **Scopes:** `openid offline_access`
- **Flow:** Authorization Code + PKCE (S256)

## Usage

```bash
npm install

# Local dev — create .dev.vars file:
echo 'ORY_PROJECT_URL=https://your-project.projects.oryapis.com' > .dev.vars
echo 'ORY_CLIENT_ID=your-client-id' >> .dev.vars
echo 'ORY_CLIENT_SECRET=your-client-secret' >> .dev.vars
npx wrangler dev

# Deploy
npx wrangler secret put ORY_PROJECT_URL
npx wrangler secret put ORY_CLIENT_ID
npx wrangler secret put ORY_CLIENT_SECRET
npx wrangler deploy
```

## Important

Add the redirect URI to your Ory OAuth client settings:
- Local: `http://localhost:8787/callback`
- Production: `https://ory-auth-demo.<subdomain>.workers.dev/callback`

## Reference

Original project: https://github.com/aisystant/digital-twin-mcp
