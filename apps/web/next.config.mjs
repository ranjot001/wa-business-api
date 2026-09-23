/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // @crm/shared ships as compiled CommonJS from the workspace.
  transpilePackages: ['@crm/shared'],
  eslint: {
    // Linting is a root level `pnpm lint` concern, not a build step.
    ignoreDuringBuilds: true,
  },
  // The API proxy is deliberately not a `rewrites()` entry. A rewrite
  // destination is resolved during `next build` and frozen into
  // routes-manifest.json, so it cannot read API_URL at runtime, which is the
  // build time baking the proxy exists to avoid. It lives in
  // app/api/v1/[...path]/route.ts instead.
};

export default nextConfig;
