import type { PrismaClient } from "@prisma/client";
import { createRepositories } from "./repositories";
import type { Repositories } from "./repositories/interfaces";

export interface IUnitOfWork {
  readonly repos: Repositories;
  transaction<T>(work: (repos: Repositories) => Promise<T>): Promise<T>;
}

/**
 * Coordinates repositories and provides atomic transactions for operations that
 * must update several tables together (opening/closing a trade + wallet state).
 */
export class UnitOfWork implements IUnitOfWork {
  readonly repos: Repositories;

  constructor(private readonly prisma: PrismaClient) {
    this.repos = createRepositories(prisma);
  }

  async transaction<T>(work: (repos: Repositories) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(async (tx) => work(createRepositories(tx)), {
      maxWait: 10_000,
      timeout: 30_000,
    });
  }
}
