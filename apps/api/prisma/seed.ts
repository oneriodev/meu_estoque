/**
 * Seed: dados iniciais do banco de DESENVOLVIMENTO.
 * Cria lojas fictícias e o administrador inicial. Pode rodar várias vezes:
 * usa "upsert" (cria se não existe, atualiza se existe), então não duplica nada.
 *
 * Rodar: npm run db:seed
 */
import { config } from 'dotenv';
import { hash } from '@node-rs/argon2';
import { PrismaPg } from '@prisma/adapter-pg';
import { z } from 'zod';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { OPCOES_ARGON2 } from '../src/modules/auth/senha.service.js';

config({ path: ['.env', '../../.env'], quiet: true });

// A senha do administrador vem do .env, nunca escrita no código
const env = z
  .object({
    DATABASE_URL: z.string().min(1),
    SEED_ADMIN_LOGIN: z.string().trim().toLowerCase().min(3),
    SEED_ADMIN_NOME: z.string().min(1).default('Administrador'),
    SEED_ADMIN_SENHA: z.string().min(12, 'A senha do administrador precisa de 12+ caracteres'),
  })
  .parse(process.env);

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: env.DATABASE_URL }) });

// Lojas FICTÍCIAS: nada de dados reais da empresa no repositório
const lojas = [
  { codigo: '01', nome: 'Loja 01 - Matriz' },
  { codigo: '02', nome: 'Loja 02 - Bairro Norte' },
  { codigo: '03', nome: 'Loja 03 - Avenida Central' },
];

async function main(): Promise<void> {
  for (const loja of lojas) {
    await prisma.loja.upsert({
      where: { codigo: loja.codigo },
      update: { nome: loja.nome },
      create: loja,
    });
  }
  console.log(`✔ ${lojas.length} lojas fictícias`);

  const senhaHash = await hash(env.SEED_ADMIN_SENHA, OPCOES_ARGON2);
  await prisma.usuario.upsert({
    where: { login: env.SEED_ADMIN_LOGIN },
    update: { nome: env.SEED_ADMIN_NOME, senhaHash, papel: 'ADMINISTRADOR', ativo: true },
    create: {
      login: env.SEED_ADMIN_LOGIN,
      nome: env.SEED_ADMIN_NOME,
      senhaHash,
      papel: 'ADMINISTRADOR',
    },
  });
  console.log(`✔ administrador "${env.SEED_ADMIN_LOGIN}"`);
}

main()
  .catch((erro: unknown) => {
    console.error('✘ Falha no seed:', erro);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
