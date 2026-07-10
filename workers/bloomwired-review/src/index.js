/**
 * bloomwired-review
 *
 * Serves prospect review PDFs from R2 at clean, branded URLs:
 *   GET  /review/{slug}   → streams the PDF inline (opens in the browser)
 *   PUT  /review/{slug}   → uploads a PDF (requires the bearer secret)
 *
 * Slugs are lowercase-hyphenated names, e.g. /review/renee-zaia
 */

// Only lowercase letters, digits and hyphens. This is the security boundary:
// without it a caller could PUT/GET arbitrary R2 keys (../, leading slashes,
// or overwrite unrelated objects in a shared bucket).
const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,127}$/;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

// Constant-time-ish comparison so a wrong secret can't be discovered by
// timing the response. Not strictly necessary here, but it's one line.
function secretsMatch(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function extractSlug(pathname) {
  const raw = pathname.replace(/^\/review\/?/, '').replace(/\/+$/, '');
  return decodeURIComponent(raw);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS });
    }

    if (!path.startsWith('/review/')) {
      return new Response('Not found', { status: 404 });
    }

    const slug = extractSlug(path);
    if (!slug || !SLUG_RE.test(slug)) {
      return new Response('Invalid review name', { status: 400, headers: CORS });
    }
    const key = `${slug}.pdf`;

    // ── Serve ────────────────────────────────────────────────────────────
    if (request.method === 'GET' || request.method === 'HEAD') {
      const object = await env.PDF_BUCKET.get(key);
      if (!object) {
        return new Response('Review not found', { status: 404, headers: CORS });
      }

      const headers = new Headers(CORS);
      headers.set('Content-Type', 'application/pdf');
      // `inline` so it opens in the browser rather than downloading.
      headers.set('Content-Disposition', `inline; filename="${slug}-review.pdf"`);
      headers.set('Cache-Control', 'public, max-age=86400');
      if (object.httpEtag) headers.set('ETag', object.httpEtag);

      return new Response(request.method === 'HEAD' ? null : object.body, { headers });
    }

    // ── Upload ───────────────────────────────────────────────────────────
    if (request.method === 'PUT') {
      // Fail closed: an unset secret must never mean "anyone may upload".
      if (!env.UPLOAD_SECRET) {
        return new Response('Upload not configured', { status: 500, headers: CORS });
      }
      const auth = request.headers.get('Authorization') || '';
      const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
      if (!secretsMatch(token, env.UPLOAD_SECRET)) {
        return new Response('Unauthorized', { status: 401, headers: CORS });
      }

      const body = await request.arrayBuffer();
      if (body.byteLength === 0) {
        return new Response('Empty body', { status: 400, headers: CORS });
      }

      await env.PDF_BUCKET.put(key, body, {
        httpMetadata: { contentType: 'application/pdf' },
      });

      return Response.json(
        { ok: true, slug, url: `${url.origin}/review/${slug}` },
        { headers: CORS }
      );
    }

    return new Response('Method not allowed', { status: 405, headers: CORS });
  },
};
