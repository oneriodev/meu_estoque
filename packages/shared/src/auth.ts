import { z } from 'zod';
import { papelUsuarioSchema } from './enums.js';

/** O que o app envia para fazer login. */
export const loginRequestSchema = z.object({
  // Logins são guardados em minúsculas: "Operador.07" e "operador.07" são o mesmo usuário
  login: z.string().trim().toLowerCase().min(3, 'Informe o login').max(50),
  // O limite de tamanho protege o servidor: calcular o hash de um texto
  // gigante de propósito seria uma forma de travar a API
  senha: z.string().min(1, 'Informe a senha').max(128),
  // Nome do aparelho, para o usuário (ou o gestor) reconhecer a sessão depois
  dispositivo: z.string().trim().max(100).optional(),
});
export type LoginRequest = z.infer<typeof loginRequestSchema>;

/** Corpo do refresh e do logout. */
export const refreshRequestSchema = z.object({
  refreshToken: z.string().min(20).max(200),
});
export type RefreshRequest = z.infer<typeof refreshRequestSchema>;

/** Par de tokens devolvido no login e em cada renovação. */
export const tokensResponseSchema = z.object({
  accessToken: z.string(),
  expiraEmSegundos: z.number().int().positive(),
  refreshToken: z.string(),
  refreshExpiraEmSegundos: z.number().int().positive(),
});
export type TokensResponse = z.infer<typeof tokensResponseSchema>;

/** Loja que o usuário pode acessar. */
export const lojaResumoSchema = z.object({
  id: z.uuid(),
  codigo: z.string(),
  nome: z.string(),
});
export type LojaResumo = z.infer<typeof lojaResumoSchema>;

/** Dados do usuário logado que o app guarda na sessão. */
export const usuarioSessaoSchema = z.object({
  id: z.uuid(),
  nome: z.string(),
  papel: papelUsuarioSchema,
  lojas: z.array(lojaResumoSchema),
});
export type UsuarioSessao = z.infer<typeof usuarioSessaoSchema>;

/** Resposta do login: os tokens mais os dados do usuário. */
export const loginResponseSchema = tokensResponseSchema.extend({
  usuario: usuarioSessaoSchema,
});
export type LoginResponse = z.infer<typeof loginResponseSchema>;
