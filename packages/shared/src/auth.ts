import { z } from 'zod';
import { papelUsuarioSchema } from './enums.js';

/** O que o app envia para fazer login. */
export const loginRequestSchema = z.object({
  // Logins são guardados em minúsculas: "Operador.07" e "operador.07" são o mesmo usuário
  login: z.string().trim().toLowerCase().min(3, 'Informe o login').max(50),
  // O limite de tamanho protege o servidor: calcular o hash de um texto
  // gigante de propósito seria uma forma de travar a API
  senha: z.string().min(1, 'Informe a senha').max(128),
});
export type LoginRequest = z.infer<typeof loginRequestSchema>;

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

/** Resposta do login. */
export const loginResponseSchema = z.object({
  accessToken: z.string(),
  expiraEmSegundos: z.number().int().positive(),
  usuario: usuarioSessaoSchema,
});
export type LoginResponse = z.infer<typeof loginResponseSchema>;
