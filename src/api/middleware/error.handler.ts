import { Prisma } from "@prisma/client";
import type { ErrorRequestHandler } from "express";
import { isAppError } from "../../utils/errors";
import type { ILogger } from "../../utils/logger";
import { MODULES } from "../../config/constants";

interface ErrorBody {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

function buildBody(code: string, message: string, details?: unknown): ErrorBody {
  return {
    success: false,
    error: details === undefined ? { code, message } : { code, message, details },
  };
}

export function errorHandler(logger: ILogger, isProduction: boolean): ErrorRequestHandler {
  return (error, req, res, next) => {
    if (res.headersSent) {
      next(error);
      return;
    }

    let status = 500;
    let code = "INTERNAL_ERROR";
    let message = "Internal server error";
    let details: unknown;

    if (isAppError(error)) {
      status = error.statusCode;
      code = error.code;
      message = error.isOperational || !isProduction ? error.message : "Request failed";
      details = error.details;
    } else if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2002") {
        status = 409;
        code = "CONFLICT";
        message = "A record with the same unique fields already exists";
      } else if (error.code === "P2025") {
        status = 404;
        code = "NOT_FOUND";
        message = "Requested record was not found";
      } else {
        code = `PRISMA_${error.code}`;
        message = isProduction ? "Database operation failed" : error.message;
      }
    } else if (error instanceof SyntaxError && "body" in error) {
      status = 400;
      code = "INVALID_JSON";
      message = "Request body contains invalid JSON";
    } else if (!isProduction && error instanceof Error) {
      message = error.message;
    }

    logger.error(MODULES.HTTP, `${req.method} ${req.originalUrl} failed`, error, {
      status,
      code,
    });

    res.status(status).json(buildBody(code, message, details));
  };
}
