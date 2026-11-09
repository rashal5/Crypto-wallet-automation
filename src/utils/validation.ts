import { ValidationError } from "./errors";

export interface NumberBounds {
  min?: number;
  max?: number;
  integer?: boolean;
}

function asFiniteNumber(value: unknown, field: string): number {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number)) {
    throw new ValidationError(`${field} must be a valid number`);
  }
  return number;
}

export function requireNumber(value: unknown, field: string, bounds: NumberBounds = {}): number {
  if (value === undefined || value === null || value === "") {
    throw new ValidationError(`${field} is required`);
  }
  const number = asFiniteNumber(value, field);
  if (bounds.integer && !Number.isInteger(number)) {
    throw new ValidationError(`${field} must be an integer`);
  }
  if (bounds.min !== undefined && number < bounds.min) {
    throw new ValidationError(`${field} must be >= ${bounds.min}`);
  }
  if (bounds.max !== undefined && number > bounds.max) {
    throw new ValidationError(`${field} must be <= ${bounds.max}`);
  }
  return number;
}

export function optionalNumber(value: unknown, field: string, bounds: NumberBounds = {}): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  return requireNumber(value, field, bounds);
}

export function requireString(value: unknown, field: string, maxLength = 200): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new ValidationError(`${field} must be a non-empty string`);
  }
  const trimmed = value.trim();
  if (trimmed.length > maxLength) {
    throw new ValidationError(`${field} must be at most ${maxLength} characters`);
  }
  return trimmed;
}

export function optionalString(value: unknown, field: string, maxLength = 200): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  return requireString(value, field, maxLength);
}

export function optionalBoolean(value: unknown, field: string): boolean | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "yes", "on"].includes(normalized)) return true;
    if (["false", "0", "no", "off"].includes(normalized)) return false;
  }
  throw new ValidationError(`${field} must be a boolean`);
}

export function requireEnum<T extends string>(value: unknown, allowed: readonly T[], field: string): T {
  const stringValue = requireString(value, field);
  if (!allowed.includes(stringValue as T)) {
    throw new ValidationError(`${field} must be one of: ${allowed.join(", ")}`);
  }
  return stringValue as T;
}

export function optionalEnum<T extends string>(
  value: unknown,
  allowed: readonly T[],
  field: string,
): T | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  return requireEnum(value, allowed, field);
}

export function parseDateValue(value: unknown, field: string): Date | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) throw new ValidationError(`${field} is an invalid date`);
    return value;
  }
  if (typeof value === "number") {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) throw new ValidationError(`${field} is an invalid date`);
    return date;
  }
  if (typeof value === "string") {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) throw new ValidationError(`${field} is an invalid date`);
    return date;
  }
  throw new ValidationError(`${field} must be a date string, timestamp or Date`);
}

export function parseLimit(value: unknown, defaultValue: number, max: number): number {
  if (value === undefined || value === null || value === "") return defaultValue;
  const parsed = Math.trunc(asFiniteNumber(value, "limit"));
  if (parsed < 1) throw new ValidationError("limit must be >= 1");
  return Math.min(parsed, max);
}

export function parseOffset(value: unknown): number {
  if (value === undefined || value === null || value === "") return 0;
  const parsed = Math.trunc(asFiniteNumber(value, "offset"));
  if (parsed < 0) throw new ValidationError("offset must be >= 0");
  return parsed;
}
