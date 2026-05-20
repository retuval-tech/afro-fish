import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import path from "node:path";
import fs from "node:fs";
import router from "./routes";
import { logger } from "./lib/logger";

export interface AppOptions {
  /** Optional path to the built frontend (Vite `dist/public`).
   *  When provided, serves static assets and an SPA fallback for non-/api routes. */
  staticDir?: string;
}

export function createApp(opts: AppOptions = {}): Express {
  const app: Express = express();

  app.use(
    pinoHttp({
      logger,
      serializers: {
        req(req) {
          return {
            id: req.id,
            method: req.method,
            url: req.url?.split("?")[0],
          };
        },
        res(res) {
          return { statusCode: res.statusCode };
        },
      },
    }),
  );
  app.use(cors());
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ extended: true }));

  app.use("/api", router);

  if (opts.staticDir) {
    const dir = opts.staticDir;
    const indexHtml = path.join(dir, "index.html");
    if (!fs.existsSync(indexHtml)) {
      logger.warn({ dir }, "staticDir provided but index.html missing");
    }
    app.use(express.static(dir, { index: false, maxAge: "1d" }));
    // SPA fallback — anything that's not /api/* falls through to index.html
    app.get(/^(?!\/api).*/, (_req, res) => {
      res.sendFile(indexHtml);
    });
  }

  return app;
}

// Backwards-compatible default export used by existing code paths.
const app = createApp();
export default app;
