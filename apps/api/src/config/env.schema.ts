import { z } from 'zod';

/**
 * Contrato das variáveis de ambiente da API.
 * Se o .env tiver uma variável faltando ou com valor inválido,
 * a API se recusa a subir e mostra qual é o problema.
 */
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  // Tudo no .env chega como texto: coerce converte "3000" para o número 3000
  API_PORT: z.coerce.number().int().min(1).max(65535).default(3000),

  // Conexão com o PostgreSQL (o mesmo usuário e senha do compose.yaml)
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),

  // Chave que assina os tokens de acesso. Quem tiver essa chave consegue
  // criar tokens válidos, por isso ela é longa, aleatória e nunca vai para o Git.
  JWT_ACCESS_SECRET: z.string().min(32, 'Use pelo menos 32 caracteres (openssl rand -hex 32)'),

  // Validade do token de acesso. Curta de propósito: se vazar, expira logo.
  JWT_ACCESS_TTL_SEGUNDOS: z.coerce.number().int().min(60).max(3600).default(900),

  // Validade do refresh token: por quantos dias o aparelho fica logado sem pedir a senha
  JWT_REFRESH_TTL_DIAS: z.coerce.number().int().min(1).max(90).default(30),

  // Origens do navegador que podem chamar a API (o painel web, no futuro).
  // Formato no .env: http://localhost:3001,https://painel.exemplo.com
  // Vazio = nenhum site pode chamar a API pelo navegador.
  CORS_ORIGINS: z
    .string()
    .default('')
    .transform((valor) =>
      valor
        .split(',')
        .map((origem) => origem.trim())
        .filter((origem) => origem.length > 0),
    )
    .pipe(z.array(z.url({ protocol: /^https?$/ }))),
});

// O tipo é deduzido do schema: uma única fonte da verdade
export type Env = z.infer<typeof envSchema>;
