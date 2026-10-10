import { Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';
import type { Env } from '../config/env.schema.js';

/**
 * Acesso ao banco. Estende o PrismaClient, então qualquer parte da API
 * que injetar o PrismaService ganha prisma.loja, prisma.usuario etc.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor(config: ConfigService<Env, true>) {
    // O Prisma 7 conversa com o PostgreSQL pelo driver "pg", via adapter
    const adapter = new PrismaPg({ connectionString: config.get('DATABASE_URL', { infer: true }) });
    super({ adapter });
  }

  /** Conecta quando a API sobe: se o banco estiver fora, a falha aparece logo. */
  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  /** Fecha as conexões quando a API para (Ctrl+C, docker stop). */
  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
