import type { Prisma, PrismaClient } from "@prisma/client";

/**
 * A repository can run against the root client or against a transaction client.
 * This allows composing atomic operations (trade + wallet) without leaking
 * Prisma semantics into the service layer.
 */
export type Db = PrismaClient | Prisma.TransactionClient;
