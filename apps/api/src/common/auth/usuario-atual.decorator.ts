import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { UsuarioAutenticado } from './usuario-autenticado.js';

/**
 * Entrega ao controller o usuário que o JwtAuthGuard identificou.
 * Uso: metodo(@UsuarioAtual() usuario: UsuarioAutenticado)
 */
export const UsuarioAtual = createParamDecorator(
  (_dados: unknown, contexto: ExecutionContext): UsuarioAutenticado => {
    const request = contexto.switchToHttp().getRequest<Request & { usuario: UsuarioAutenticado }>();
    return request.usuario;
  },
);
