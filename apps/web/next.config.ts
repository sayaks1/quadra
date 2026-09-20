import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@quadra/shared"],
  serverExternalPackages: ["sql.js"],
};

export default nextConfig;
