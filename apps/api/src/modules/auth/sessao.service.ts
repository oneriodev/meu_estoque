import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env.schema.js';
import { PrismaService } from '../../database/prisma.service.js';

export interface RefreshEmitido {
  refreshToken: string;
  refreshExpiraEmSegundos: number;
}

export interface SessaoRenovada extends RefreshEmitido {
  usuarioId: string;
}

/**
 * Cuida dos refresh tokens: cria, troca (rotação) e revoga.
 *
 * O token é um texto aleatório de 256 bits entregue ao aparelho.
 * No banco fica só o SHA-256 dele: quem ler o banco não consegue usá-lo.
 */
@Injectable()
export class SessaoService {
  private readonly logger = new Logger(SessaoService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  /** Cria a sessão de um login novo (uma família nova). */
  async criar(usuarioId: string, dispositivo?: string): Promise<RefreshEmitido> {
    return this.emitir(usuarioId, randomUUID(), dispositivo);
  }

  /**
   * Troca um refresh token por um novo. O antigo deixa de valer na hora.
   * Se um token JÁ TROCADO aparecer de novo, alguém o copiou:
   * derrubamos a família inteira e o usuário precisa entrar de novo.
   */
  async renovar(refreshToken: string): Promise<SessaoRenovada> {
    const sessao = await this.prisma.sessaoRefresh.findUnique({
      where: { tokenHash: this.calcularHash(refreshToken) },
      include: { usuario: { select: { ativo: true } } },
    });

    if (!sessao) throw new UnauthorizedException('Sessão inválida');

    if (sessao.revogadoEm) {
      await this.revogarFamilia(sessao.familiaId);
      this.logger.warn(
        `Refresh token reutilizado (usuário ${sessao.usuarioId}). Família ${sessao.familiaId} revogada.`,
      );
      throw new UnauthorizedException('Sessão inválida');
    }

    if (sessao.expiraEm <= new Date() || !sessao.usuario.ativo) {
      await this.revogarFamilia(sessao.familiaId);
      throw new UnauthorizedException('Sessão expirada');
    }

    // Revoga o token atual SOMENTE se ninguém fez isso antes (condição no WHERE).
    // Se duas renovações com o mesmo token chegarem juntas, só uma vence;
    // a outra é tratada como reutilização.
    const { count } = await this.prisma.sessaoRefresh.updateMany({
      where: { id: sessao.id, revogadoEm: null },
      data: { revogadoEm: new Date() },
    });
    if (count === 0) {
      await this.revogarFamilia(sessao.familiaId);
      throw new UnauthorizedException('Sessão inválida');
    }

    const novo = await this.emitir(
      sessao.usuarioId,
      sessao.familiaId,
      sessao.dispositivo ?? undefined,
    );
    return { usuarioId: sessao.usuarioId, ...novo };
  }

  /** Logout: encerra a sessão deste aparelho (a família do token). */
  async encerrar(refreshToken: string): Promise<void> {
    const sessao = await this.prisma.sessaoRefresh.findUnique({
      where: { tokenHash: this.calcularHash(refreshToken) },
      select: { familiaId: true },
    });
    // Token desconhecido: não revela nada, só não faz nada (logout é idempotente)
    if (sessao) await this.revogarFamilia(sessao.familiaId);
  }

  private async emitir(
    usuarioId: string,
    familiaId: string,
    dispositivo?: string,
  ): Promise<RefreshEmitido> {
    const refreshToken = randomBytes(32).toString('base64url');
    const dias = this.config.get('JWT_REFRESH_TTL_DIAS', { infer: true });
    const segundos = dias * 24 * 60 * 60;

    await this.prisma.sessaoRefresh.create({
      data: {
        usuarioId,
        familiaId,
        dispositivo: dispositivo ?? null,
        tokenHash: this.calcularHash(refreshToken),
        expiraEm: new Date(Date.now() + segundos * 1000),
      },
    });

    return { refreshToken, refreshExpiraEmSegundos: segundos };
  }

  private async revogarFamilia(familiaId: string): Promise<void> {
    await this.prisma.sessaoRefresh.updateMany({
      where: { familiaId, revogadoEm: null },
      data: { revogadoEm: new Date() },
    });
  }

  /**
   * SHA-256 é rápido, e aqui isso não é problema: o token tem 256 bits
   * aleatórios, então não dá para adivinhá-lo testando possibilidades.
   * Senhas são diferentes (curtas e previsíveis), por isso usam argon2.
   */
  private calcularHash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
