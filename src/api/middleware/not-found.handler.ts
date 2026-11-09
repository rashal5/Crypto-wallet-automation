import type { RequestHandler } from "express";

export function notFoundHandler(): RequestHandler {
  return (req, res) => {
    res.status(404).json({
      success: false,
      error: {
        code: "NOT_FOUND",
        message: `Route ${req.method} ${req.originalUrl} not found`,
      },
    });
  };
}
