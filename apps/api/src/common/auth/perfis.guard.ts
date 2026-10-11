import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { PapelUsuario } from '@meu-estoque/shared';
import type { Request } from 'express';
import { PERFIS_PERMITIDOS } from './perfis.decorator.js';
import type { UsuarioAutenticado } from './usuario-autenticado.js';

/**
 * Roda depois do JwtAuthGuard. Se a rota tiver @Perfis(...),
 * só deixa passar quem tem um dos perfis da lista. Os demais recebem 403.
 */
@Injectable()
export class PerfisGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(contexto: ExecutionContext): boolean {
    const perfis = this.reflector.getAllAndOverride<PapelUsuario[] | undefined>(PERFIS_PERMITIDOS, [
      contexto.getHandler(),
      contexto.getClass(),
    ]);
    if (!perfis) return true;

    const { usuario } = contexto
      .switchToHttp()
      .getRequest<Request & { usuario?: UsuarioAutenticado }>();

    if (!usuario || !perfis.includes(usuario.papel)) {
      throw new ForbiddenException('Seu perfil não tem acesso a esta operação');
    }
    return true;
  }
}
