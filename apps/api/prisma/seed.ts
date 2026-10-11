/**
 * Seed: dados iniciais do banco de DESENVOLVIMENTO.
 * Cria lojas fictícias, o administrador inicial e usuários de teste.
 * Pode rodar várias vezes: usa "upsert" (cria se não existe, atualiza se existe).
 *
 * Rodar: npm run db:seed
 */
import { config } from 'dotenv';
import { hash } from '@node-rs/argon2';
import { PrismaPg } from '@prisma/adapter-pg';
import { z } from 'zod';
import { PrismaClient, type PapelUsuario } from '../src/generated/prisma/client.js';
import { OPCOES_ARGON2 } from '../src/modules/auth/senha.service.js';

config({ path: ['.env', '../../.env'], quiet: true });

// As senhas vêm do .env, nunca escritas no código
const env = z
  .object({
    DATABASE_URL: z.string().min(1),
    SEED_ADMIN_LOGIN: z.string().trim().toLowerCase().min(3),
    SEED_ADMIN_NOME: z.string().min(1).default('Administrador'),
    SEED_ADMIN_SENHA: z.string().min(12, 'A senha do administrador precisa de 12+ caracteres'),
    // Senha dos usuários de teste (operador e supervisor). Só para desenvolvimento.
    SEED_SENHA_TESTE: z.string().min(12, 'A senha de teste precisa de 12+ caracteres'),
  })
  .parse(process.env);

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: env.DATABASE_URL }) });

// Lojas FICTÍCIAS: nada de dados reais da empresa no repositório
const lojas = [
  { codigo: '01', nome: 'Loja 01 - Matriz' },
  { codigo: '02', nome: 'Loja 02 - Bairro Norte' },
  { codigo: '03', nome: 'Loja 03 - Avenida Central' },
];

// Usuários de teste, cada um vinculado a uma loja
const usuariosTeste: { login: string; nome: string; papel: PapelUsuario; loja: string }[] = [
  { login: 'operador.01', nome: 'Operador Teste 01', papel: 'OPERADOR', loja: '01' },
  { login: 'supervisor.01', nome: 'Supervisor Teste 01', papel: 'SUPERVISOR', loja: '01' },
  { login: 'operador.02', nome: 'Operador Teste 02', papel: 'OPERADOR', loja: '02' },
];

async function salvarUsuario(
  login: string,
  nome: string,
  senha: string,
  papel: PapelUsuario,
): Promise<string> {
  const senhaHash = await hash(senha, OPCOES_ARGON2);
  const usuario = await prisma.usuario.upsert({
    where: { login },
    update: { nome, senhaHash, papel, ativo: true },
    create: { login, nome, senhaHash, papel },
  });
  return usuario.id;
}

async function main(): Promise<void> {
  const idsLojas = new Map<string, string>();
  for (const loja of lojas) {
    const salva = await prisma.loja.upsert({
      where: { codigo: loja.codigo },
      update: { nome: loja.nome },
      create: loja,
    });
    idsLojas.set(loja.codigo, salva.id);
  }
  console.log(`✔ ${lojas.length} lojas fictícias`);

  await salvarUsuario(
    env.SEED_ADMIN_LOGIN,
    env.SEED_ADMIN_NOME,
    env.SEED_ADMIN_SENHA,
    'ADMINISTRADOR',
  );
  console.log(`✔ administrador "${env.SEED_ADMIN_LOGIN}"`);

  for (const teste of usuariosTeste) {
    const usuarioId = await salvarUsuario(
      teste.login,
      teste.nome,
      env.SEED_SENHA_TESTE,
      teste.papel,
    );
    const lojaId = idsLojas.get(teste.loja);
    if (!lojaId) throw new Error(`Loja ${teste.loja} não encontrada`);
    await prisma.usuarioLoja.upsert({
      where: { usuarioId_lojaId: { usuarioId, lojaId } },
      update: {},
      create: { usuarioId, lojaId },
    });
    console.log(`✔ ${teste.papel.toLowerCase()} "${teste.login}" na loja ${teste.loja}`);
  }
}

main()
  .catch((erro: unknown) => {
    console.error('✘ Falha no seed:', erro);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
