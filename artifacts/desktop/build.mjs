/**
 * Build script for the Electron desktop bundle.
 *
 * Produces:
 *   dist/main.cjs              — single-file Electron main process bundle
 *   dist/web/                  — copy of @workspace/afro-fish Vite build
 *
 * Externalizes Electron and PGlite (PGlite needs to load its WASM at runtime).
 */
import { build as esbuild } from "esbuild";
import { rm, mkdir, cp } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

globalThis.require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));

const distDir = path.resolve(here, "dist");
const webOutDir = path.resolve(here, "dist/web");
const frontendDist = path.resolve(here, "../afro-fish/dist/public");

async function buildMain() {
  await esbuild({
    entryPoints: [path.resolve(here, "src/main.ts")],
    platform: "node",
    bundle: true,
    format: "cjs",
    outfile: path.resolve(distDir, "main.cjs"),
    logLevel: "info",
    sourcemap: "linked",
    target: "node20",
    external: [
      "electron",
      "*.node",
      // PGlite + its WASM stay external — copied in via dependencies.
      "@electric-sql/pglite",
      // pg is bundled for cloud schema parity but isn't used in PGlite mode.
      "pg",
      "pg-native",
      // pino transports want to spawn workers from real files.
      "pino",
      "pino-pretty",
      "thread-stream",
      "sonic-boom",
    ],
  });
}

async function copyFrontend() {
  if (!existsSync(frontendDist)) {
    throw new Error(
      `Frontend build not found at ${frontendDist}. Run \`pnpm --filter @workspace/afro-fish run build\` first.`,
    );
  }
  await rm(webOutDir, { recursive: true, force: true });
  await mkdir(webOutDir, { recursive: true });
  await cp(frontendDist, webOutDir, { recursive: true });
}

async function main() {
  await rm(distDir, { recursive: true, force: true });
  await mkdir(distDir, { recursive: true });
  await buildMain();
  await copyFrontend();
  console.log("Desktop bundle ready at", distDir);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
