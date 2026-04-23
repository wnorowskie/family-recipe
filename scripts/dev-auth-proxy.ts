#!/usr/bin/env tsx
/*
 * dev-auth-proxy.ts — localhost HTTP proxy that injects a fresh Cloud Run
 * ID token on every outbound request, so a browser (or Playwright) can load
 * the `--no-allow-unauthenticated` dev deployment end-to-end.
 *
 * Why this exists: dev Cloud Run requires a Bearer ID token on every request
 * including CSS/JS/image subresources. Browsers won't attach `Authorization`
 * headers to subresource loads, so the page never hydrates. This proxy mints
 * a token by impersonating the deployer SA (same pattern as smoke-dev.sh) and
 * attaches it to every forwarded request. It also strips `Secure` from
 * Set-Cookie so the session cookie survives the plain-HTTP localhost hop.
 *
 * Usage:
 *   npm run proxy:dev             # reads .env.dev.local, listens on :3100
 *   PROXY_PORT=4000 npm run proxy:dev
 *
 * Required env (from .env.dev.local or the shell):
 *   DEV_NEXT_URL                  upstream Cloud Run URL
 *   DEV_DEPLOYER_SA               SA to impersonate for ID tokens
 */
import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as http from 'node:http';
import * as https from 'node:https';
import * as path from 'node:path';
import { URL } from 'node:url';

type TokenState = {
  token: string;
  mintedAt: number;
  expiresAt: number;
};

const ENV_FILE = path.resolve(__dirname, '..', '.env.dev.local');
const TOKEN_TTL_MS = 50 * 60 * 1000; // refresh a bit before Google's 1h cap
const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000;

loadEnvFile(ENV_FILE);

const UPSTREAM_URL = requiredEnv('DEV_NEXT_URL');
const DEPLOYER_SA = requiredEnv('DEV_DEPLOYER_SA');
const PORT = Number(process.env.PROXY_PORT ?? 3100);

const upstream = new URL(UPSTREAM_URL);
if (upstream.protocol !== 'https:') {
  throw new Error(`DEV_NEXT_URL must be https, got ${UPSTREAM_URL}`);
}

let tokenState: TokenState | null = null;
let inflightMint: Promise<TokenState> | null = null;

async function getToken(): Promise<string> {
  const now = Date.now();
  if (tokenState && now < tokenState.expiresAt - TOKEN_REFRESH_BUFFER_MS) {
    return tokenState.token;
  }
  if (!inflightMint) {
    inflightMint = mintToken().finally(() => {
      inflightMint = null;
    });
  }
  const next = await inflightMint;
  tokenState = next;
  return next.token;
}

function mintToken(): Promise<TokenState> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      'gcloud',
      [
        'auth',
        'print-identity-token',
        `--impersonate-service-account=${DEPLOYER_SA}`,
        `--audiences=${UPSTREAM_URL}`,
      ],
      { stdio: ['ignore', 'pipe', 'pipe'] }
    );
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => (stdout += chunk.toString()));
    child.stderr.on('data', (chunk) => (stderr += chunk.toString()));
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) {
        reject(
          new Error(
            `gcloud mint failed (exit ${code}); is roles/iam.serviceAccountTokenCreator granted on ${DEPLOYER_SA}?\n${stderr.trim()}`
          )
        );
        return;
      }
      const token = stdout.trim();
      if (!token) {
        reject(new Error('gcloud returned empty token'));
        return;
      }
      const mintedAt = Date.now();
      resolve({ token, mintedAt, expiresAt: mintedAt + TOKEN_TTL_MS });
    });
  });
}

function rewriteSetCookie(values: string[]): string[] {
  // Dev Cloud Run is https → cookies carry `Secure`, which makes browsers drop
  // them on the plain-http localhost hop. Strip it here. Also drop any
  // Domain= so the browser scopes the cookie to localhost automatically.
  return values.map((value) =>
    value
      .split(';')
      .map((part) => part.trim())
      .filter((part) => part.length > 0)
      .filter((part) => !/^secure$/i.test(part))
      .filter((part) => !/^domain=/i.test(part))
      .join('; ')
  );
}

function rewriteLocation(location: string): string {
  if (location.startsWith(upstream.origin)) {
    return location.slice(upstream.origin.length) || '/';
  }
  return location;
}

function buildUpstreamHeaders(
  incoming: http.IncomingHttpHeaders,
  token: string
): http.OutgoingHttpHeaders {
  const headers: http.OutgoingHttpHeaders = {};
  for (const [key, value] of Object.entries(incoming)) {
    if (value === undefined) continue;
    const k = key.toLowerCase();
    // Hop-by-hop + ones we rewrite ourselves.
    if (
      k === 'host' ||
      k === 'connection' ||
      k === 'keep-alive' ||
      k === 'proxy-authorization' ||
      k === 'proxy-connection' ||
      k === 'te' ||
      k === 'trailer' ||
      k === 'transfer-encoding' ||
      k === 'upgrade' ||
      k === 'authorization'
    ) {
      continue;
    }
    headers[k] = value;
  }
  headers['host'] = upstream.host;
  headers['authorization'] = `Bearer ${token}`;
  return headers;
}

const server = http.createServer(async (req, res) => {
  const started = Date.now();
  let token: string;
  try {
    token = await getToken();
  } catch (err) {
    res.statusCode = 502;
    res.setHeader('content-type', 'text/plain; charset=utf-8');
    res.end(
      `dev-auth-proxy: could not mint ID token\n${(err as Error).message}\n`
    );
    console.error(`[proxy] token mint failed: ${(err as Error).message}`);
    return;
  }

  const upstreamReq = https.request(
    {
      protocol: upstream.protocol,
      host: upstream.hostname,
      port: upstream.port || 443,
      method: req.method,
      path: req.url,
      headers: buildUpstreamHeaders(req.headers, token),
    },
    (upstreamRes) => {
      const headers = { ...upstreamRes.headers };
      const rawCookies = upstreamRes.headers['set-cookie'];
      if (Array.isArray(rawCookies) && rawCookies.length > 0) {
        headers['set-cookie'] = rewriteSetCookie(rawCookies);
      }
      if (typeof headers['location'] === 'string') {
        headers['location'] = rewriteLocation(headers['location']);
      }
      delete headers['strict-transport-security'];
      res.writeHead(upstreamRes.statusCode ?? 502, headers);
      upstreamRes.pipe(res);
      upstreamRes.on('end', () => {
        const ms = Date.now() - started;
        console.log(
          `[proxy] ${req.method} ${req.url} → ${upstreamRes.statusCode} (${ms}ms)`
        );
      });
    }
  );

  upstreamReq.on('error', (err) => {
    console.error(
      `[proxy] upstream error for ${req.method} ${req.url}: ${err.message}`
    );
    if (!res.headersSent) {
      res.statusCode = 502;
      res.setHeader('content-type', 'text/plain; charset=utf-8');
      res.end(`dev-auth-proxy: upstream error — ${err.message}\n`);
    } else {
      res.destroy(err);
    }
  });

  req.pipe(upstreamReq);
});

function shutdown(signal: NodeJS.Signals) {
  console.log(`[proxy] ${signal} received, shutting down`);
  server.close(() => process.exit(0));
  // Hard cap so a hung upstream connection doesn't block exit forever.
  setTimeout(() => process.exit(0), 2000).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// Pre-mint so the first page load doesn't pay the ~1s gcloud cost. Fail fast
// here so a missing IAM grant surfaces before Playwright starts.
getToken().then(
  () =>
    server.listen(PORT, '127.0.0.1', () => {
      console.log(
        `[proxy] listening on http://localhost:${PORT} → ${upstream.origin}`
      );
      console.log(`[proxy] impersonating ${DEPLOYER_SA}`);
    }),
  (err) => {
    console.error(`[proxy] startup failed: ${(err as Error).message}`);
    process.exit(1);
  }
);

function requiredEnv(name: string): string {
  const v = process.env[name];
  if (!v || !v.trim()) {
    console.error(
      `[proxy] missing required env ${name} (populate .env.dev.local — see docs/verification/dev-deployments.md)`
    );
    process.exit(1);
  }
  return v.trim();
}

function loadEnvFile(filePath: string): void {
  if (!fs.existsSync(filePath)) return;
  const contents = fs.readFileSync(filePath, 'utf8');
  for (const rawLine of contents.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}
