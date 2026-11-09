import type { Response } from "express";

export function sendData<T>(
  res: Response,
  data: T,
  meta?: Record<string, unknown>,
): void {
  res.json(meta ? { success: true, data, meta } : { success: true, data });
}
