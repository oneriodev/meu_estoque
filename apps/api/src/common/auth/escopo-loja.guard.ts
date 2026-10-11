import {
  BadRequestException,
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { z } from 'zod';
import { PrismaService } from '../../database/prisma.service.js';
import { PARAMETRO_LOJA } from './exige-loja.decorator.js';
import type { UsuarioAutenticado } from './usuario-autenticado.js';

const uuidSchema = z.uuid();

/**
 * Escopo por loja, verificado NA API: esconder botões no app não basta,
 * porque qualquer pessoa pode chamar a API direto.
 * Administrador acessa todas as lojas; os demais, só as vinculadas a eles.
 */
@Injectable()
export class EscopoLojaGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(contexto: ExecutionContext): Promise<boolean> {
    const parametro = this.reflector.getAllAndOverride<string | undefined>(PARAMETRO_LOJA, [
      contexto.getHandler(),
      contexto.getClass(),
    ]);
    if (!parametro) return true;

    const request = contexto
      .switchToHttp()
      .getRequest<Request & { usuario?: UsuarioAutenticado }>();
    const lojaId = request.params[parametro];

    // Os guards rodam ANTES da validação dos parâmetros, então conferimos o formato aqui
    if (!uuidSchema.safeParse(lojaId).success) {
      throw new BadRequestException('Identificador de loja inválido');
    }

    const usuario = request.usuario;
    if (!usuario) throw new ForbiddenException('Sem acesso a esta loja');
    if (usuario.papel === 'ADMINISTRADOR') return true;

    const vinculo = await this.prisma.usuarioLoja.findUnique({
      where: { usuarioId_lojaId: { usuarioId: usuario.id, lojaId: lojaId as string } },
      select: { loja: { select: { ativa: true } } },
    });
    if (!vinculo?.loja.ativa) throw new ForbiddenException('Sem acesso a esta loja');

    return true;
  }
}
