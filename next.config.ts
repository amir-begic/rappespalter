import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Emit a self-contained server bundle at .next/standalone for the Electron build.
  output: "standalone",

  // NFT (the file tracer) follows static imports, but it misses two things our
  // stack needs in the packaged app, so we force them in:
  //  - the Prisma client generated outside src/ (generated/prisma)
  //  - @libsql/client's native (.node) bindings used for the local SQLite file
  outputFileTracingIncludes: {
    "/**": [
      "generated/prisma/**/*",
      "node_modules/@libsql/**/*",
      "node_modules/@prisma/adapter-libsql/**/*",
    ],
  },
};

export default nextConfig;
