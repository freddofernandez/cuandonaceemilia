export function onRequestGet({ env }) {
  return Response.json({ turnstileSiteKey: env.TURNSTILE_SITE_KEY || null }, {
    headers: { 'Cache-Control': 'public, max-age=300', 'X-Content-Type-Options': 'nosniff' }
  });
}
