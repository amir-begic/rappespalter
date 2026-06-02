import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Emit a self-contained server bundle at .next/standalone for the Electron build.
  output: "standalone",

  // We don't use Next's image optimizer (a local-first desktop app serves its own
  // assets), so disable it. This avoids pulling in `sharp` + its native libvips
  // binaries (~17 MB) at runtime.
  images: { unoptimized: true },

  // NFT (the file tracer) follows static imports, but it misses two things our
  // stack needs in the packaged app, so we force them in:
  //  - the Prisma client generated outside src/ (generated/prisma)
  //  - @libsql/client's native (.node) bindings used for the local SQLite file
  outputFileTracingIncludes: {
    "/*": [
      "generated/prisma/**/*",
      "node_modules/@libsql/**/*",
      "node_modules/@prisma/adapter-libsql/**/*",
      // Next loads @swc/helpers at runtime via its require-hook, which the file
      // tracer can't follow statically — force it in so the standalone bundle is
      // self-contained. (Resolvable as a top-level path thanks to the hoisted
      // node_modules layout configured in .npmrc.)
      "node_modules/@swc/helpers/**/*",
    ],
  },

  // Keep sharp's native image libraries out of the bundle — unused now that image
  // optimization is disabled. Saves ~17 MB.
  outputFileTracingExcludes: {
    "/*": ["node_modules/@img/**/*", "node_modules/sharp/**/*"],
  },
};

export default nextConfig;
