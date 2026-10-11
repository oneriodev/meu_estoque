import type { PapelUsuario } from '@meu-estoque/shared';

/** Quem está fazendo a requisição, segundo o token de acesso. */
export interface UsuarioAutenticado {
  id: string;
  papel: PapelUsuario;
}

/** Conteúdo (payload) que vai dentro do token JWT. */
export interface PayloadToken {
  /** "subject": o id do usuário. Nome padrão da especificação JWT. */
  sub: string;
  papel: PapelUsuario;
}
