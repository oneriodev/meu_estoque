import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { ROTA_PUBLICA } from './public.decorator.js';
import type { PayloadToken, UsuarioAutenticado } from './usuario-autenticado.js';

/**
 * Barreira global: roda antes de TODAS as rotas.
 * Sem um token válido no cabeçalho "Authorization: Bearer <token>", responde 401.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwtService: JwtService,
  ) {}

  async canActivate(contexto: ExecutionContext): Promise<boolean> {
    // Rotas marcadas com @Public() passam direto
    const publica = this.reflector.getAllAndOverride<boolean>(ROTA_PUBLICA, [
      contexto.getHandler(),
      contexto.getClass(),
    ]);
    if (publica) return true;

    const request = contexto
      .switchToHttp()
      .getRequest<Request & { usuario?: UsuarioAutenticado }>();
    const token = this.extrairToken(request);
    if (!token) throw new UnauthorizedException('Token de acesso ausente');

    try {
      // Confere a assinatura e a validade (exp). Token adulterado ou vencido falha aqui.
      const payload = await this.jwtService.verifyAsync<PayloadToken>(token);
      request.usuario = { id: payload.sub, papel: payload.papel };
      return true;
    } catch {
      throw new UnauthorizedException('Token de acesso inválido ou expirado');
    }
  }

  private extrairToken(request: Request): string | undefined {
    const [tipo, token] = request.headers.authorization?.split(' ') ?? [];
    return tipo === 'Bearer' ? token : undefined;
  }
}
