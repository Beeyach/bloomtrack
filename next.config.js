/** @type {import('next').NextConfig} */
const nextConfig = {
  // better-sqlite3 is gone — we use Cloudflare D1 via @cloudflare/next-on-pages.
  // No special externals needed; D1 is provided by the runtime binding.
};

// In dev (`next dev`), wire up D1 from wrangler so the same getRequestContext
// helper works locally. This is a no-op in the actual Pages build.
if (process.env.NODE_ENV === 'development') {
  // setupDevPlatform reads wrangler.toml and exposes the bindings via
  // getRequestContext during `next dev`.
  // We import lazily so a missing dep doesn't break production builds.
  (async () => {
    try {
      const { setupDevPlatform } = await import('@cloudflare/next-on-pages/next-dev');
      await setupDevPlatform();
    } catch {
      // optional in dev; ignore if not installed yet
    }
  })();
}

module.exports = nextConfig;
