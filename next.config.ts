import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
  serverExternalPackages: ['@prisma/client', 'bcryptjs'],
  experimental: {
    outputFileTracingIncludes: {
      '/*': ['./node_modules/bcryptjs/**/*']
    }
  }
};

export default nextConfig;
