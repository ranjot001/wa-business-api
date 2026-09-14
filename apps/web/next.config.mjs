/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // @crm/shared ships as compiled CommonJS from the workspace.
  transpilePackages: ['@crm/shared'],
  eslint: {
    // Linting is a root level `pnpm lint` concern, not a build step.
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
