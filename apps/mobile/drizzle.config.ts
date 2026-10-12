import { defineConfig } from 'drizzle-kit';

/**
 * Configuração do drizzle-kit, a ferramenta que GERA as migrações do banco local.
 * Ela compara o src/db/schema.ts com as migrações já existentes e escreve o SQL da diferença.
 * Comando: npm run db:gerar -w @meu-estoque/mobile
 */
export default defineConfig({
  dialect: 'sqlite',
  // "expo" gera também o arquivo migrations.js, que o app importa
  driver: 'expo',
  schema: './src/db/schema.ts',
  out: './drizzle',
});
