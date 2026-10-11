import { config } from 'dotenv';
import { defineConfig, env } from 'prisma/config';

// O .env fica na raiz do monorepo. Em produção não há arquivo:
// as variáveis vêm do servidor e o dotenv simplesmente não faz nada.
config({ path: ['.env', '../../.env'], quiet: true });

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    // Comando do "npm run db:seed" (prisma db seed)
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    url: env('DATABASE_URL'),
  },
});
