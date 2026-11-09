import type { RequestHandler } from "express";
import type { ILogger } from "../../utils/logger";

export function requestLogger(logger: ILogger): RequestHandler {
  return (req, res, next) => {
    const startedAt = Date.now();

    res.on("finish", () => {
      logger.debug("http", `${req.method} ${req.originalUrl}`, {
        status: res.statusCode,
        durationMs: Date.now() - startedAt,
        ip: req.ip,
      });
    });

    next();
  };
}
