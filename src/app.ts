import cors from "cors";
import express, { type Express } from "express";
import helmet from "helmet";
import type { AppContainer } from "./container";
import { errorHandler } from "./api/middleware/error.handler";
import { notFoundHandler } from "./api/middleware/not-found.handler";
import { requestLogger } from "./api/middleware/request-logger";
import { createApiRouter } from "./api/routes";

function resolveCorsOrigin(origin: string): true | string[] {
  if (origin.trim() === "*") return true;
  return origin
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

export function createApp(container: AppContainer): Express {
  const app = express();

  app.disable("x-powered-by");
  app.set("trust proxy", true);
  app.use(helmet());
  app.use(
    cors({
      origin: resolveCorsOrigin(container.config.http.corsOrigin),
      methods: ["GET", "POST", "PUT", "OPTIONS"],
    }),
  );
  app.use(express.json({ limit: "1mb" }));
  app.use(requestLogger(container.logger));

  const router = createApiRouter(container);
  app.use("/", router);

  const prefix = container.config.http.apiPrefix.replace(/\/+$/, "");
  if (prefix && prefix !== "/") {
    app.use(prefix, router);
  }

  app.use(notFoundHandler());
  app.use(errorHandler(container.logger, container.config.isProduction));

  return app;
}
