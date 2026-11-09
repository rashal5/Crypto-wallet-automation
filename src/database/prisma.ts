import { PrismaClient } from "@prisma/client";
import { config } from "../config";

/**
 * Single Prisma client for the process. Repositories receive this instance (or a
 * transaction-scoped client) through constructor injection.
 */
export const prisma = new PrismaClient({
  log: config.isProduction ? ["error"] : ["warn", "error"],
});

export async function connectDatabase(): Promise<void> {
  await prisma.$connect();
}

export async function disconnectDatabase(): Promise<void> {
  await prisma.$disconnect();
}
