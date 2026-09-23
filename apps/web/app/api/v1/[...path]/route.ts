import { NextResponse, type NextRequest } from 'next/server';
import { getApiUrl } from '@/lib/api';

/**
 * Same origin proxy for the API.
 *
 * The browser only ever calls /api/v1/... on the web domain, and this forwards
 * it to API_URL server side. Two things depend on that:
 *
 *   1. No API hostname is baked into the client bundle, so a host that sets
 *      API_URL after the build still works.
 *   2. The refresh cookie stays same site. crmweb-production and
 *      crmapi-production are separate sites under up.railway.app, so a
 *      SameSite=lax cookie set on the API's own domain would never be sent
 *      back from the web app. Proxied, the cookie belongs to the web domain.
 *
 * This is a route handler rather than a `rewrites()` entry in next.config.mjs
 * because a rewrite destination is resolved during `next build` and written
 * into routes-manifest.json: `next start` keeps proxying to whatever API_URL
 * was at build time, which is the same build time baking the proxy exists to
 * avoid. A handler reads the environment on every request.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Hop by hop headers, plus the ones the fetch below must set for itself. */
const STRIPPED_REQUEST_HEADERS = new Set([
  'connection',
  'content-length',
  'host',
  'keep-alive',
  'transfer-encoding',
  'upgrade',
]);

const STRIPPED_RESPONSE_HEADERS = new Set([
  'connection',
  'content-encoding',
  'content-length',
  'keep-alive',
  'transfer-encoding',
  'upgrade',
]);

async function proxy(request: NextRequest): Promise<Response> {
  // Read per request, not at module scope, so a restart picks up a new value.
  const target = new URL(
    request.nextUrl.pathname.replace(/^\/api/, '') + request.nextUrl.search,
    getApiUrl(),
  );

  const headers = new Headers();
  request.headers.forEach((value, key) => {
    if (!STRIPPED_REQUEST_HEADERS.has(key.toLowerCase())) {
      headers.set(key, value);
    }
  });

  // The API reads the caller's IP for rate limiting, which would otherwise be
  // this server's for every visitor.
  const forwardedFor = request.headers.get('x-forwarded-for');
  if (forwardedFor) {
    headers.set('x-forwarded-for', forwardedFor);
  }

  const hasBody = request.method !== 'GET' && request.method !== 'HEAD';

  const upstream = await fetch(target, {
    method: request.method,
    headers,
    body: hasBody ? await request.arrayBuffer() : undefined,
    redirect: 'manual',
    cache: 'no-store',
  });

  const responseHeaders = new Headers();
  upstream.headers.forEach((value, key) => {
    if (!STRIPPED_RESPONSE_HEADERS.has(key.toLowerCase()) && key.toLowerCase() !== 'set-cookie') {
      responseHeaders.set(key, value);
    }
  });

  // Set-Cookie can appear more than once and collapsing it into one header
  // would corrupt every cookie after the first, so it is copied separately.
  for (const cookie of upstream.headers.getSetCookie()) {
    responseHeaders.append('set-cookie', cookie);
  }

  return new NextResponse(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
  });
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
export const HEAD = proxy;
export const OPTIONS = proxy;
