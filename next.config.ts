import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  serverExternalPackages: ["ali-oss", "pg", "@prisma/adapter-pg"],
};

export default nextConfig;
