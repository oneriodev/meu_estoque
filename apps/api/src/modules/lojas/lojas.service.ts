import { Injectable, NotFoundException } from '@nestjs/common';
import type { LojaResumo, PapelUsuario } from '@meu-estoque/shared';
import { PrismaService } from '../../database/prisma.service.js';

export interface MembroEquipe {
  id: string;
  nome: string;
  papel: PapelUsuario;
}

@Injectable()
export class LojasService {
  constructor(private readonly prisma: PrismaService) {}

  async buscar(lojaId: string): Promise<LojaResumo> {
    const loja = await this.prisma.loja.findUnique({
      where: { id: lojaId },
      select: { id: true, codigo: true, nome: true },
    });
    if (!loja) throw new NotFoundException('Loja não encontrada');
    return loja;
  }

  /** Equipe da loja (LGPD: só o necessário, sem login nem dados pessoais). */
  async listarEquipe(lojaId: string): Promise<MembroEquipe[]> {
    const vinculos = await this.prisma.usuarioLoja.findMany({
      where: { lojaId, usuario: { ativo: true } },
      select: { usuario: { select: { id: true, nome: true, papel: true } } },
      orderBy: { usuario: { nome: 'asc' } },
    });
    return vinculos.map((vinculo) => vinculo.usuario);
  }
}
