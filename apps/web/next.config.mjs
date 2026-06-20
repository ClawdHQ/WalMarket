/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@walmarket/sdk'],
  experimental: {
    instrumentationHook: true,
    // better-sqlite3 is a native addon (managed-seller key store) — must not be
    // bundled by webpack, just resolved normally from node_modules at runtime.
    serverComponentsExternalPackages: ['better-sqlite3'],
  },
};

export default nextConfig;
