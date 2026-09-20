import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@quadra/shared"],
  serverExternalPackages: ["sql.js"],
  // Cloud/agent browsers hit 127.0.0.1 while next binds 0.0.0.0
  allowedDevOrigins: ["127.0.0.1", "localhost"],
};

export default nextConfig;
