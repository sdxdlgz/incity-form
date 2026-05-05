import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["xlsx"],
  allowedDevOrigins: ["192.168.60.83"],
};

export default nextConfig;
