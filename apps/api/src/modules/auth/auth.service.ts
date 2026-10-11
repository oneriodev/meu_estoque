import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { LoginRequest, LoginResponse, UsuarioSessao } from '@meu-estoque/shared';
import type { PayloadToken } from '../../common/auth/usuario-autenticado.js';
import type { Env } from '../../config/env.schema.js';
import { PrismaService } from '../../database/prisma.service.js';
import { SenhaService } from './senha.service.js';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly senhaService: SenhaService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async login(dados: LoginRequest): Promise<LoginResponse> {
    const usuario = await this.prisma.usuario.findUnique({
      where: { login: dados.login },
    });

    // A senha é conferida MESMO quando o login não existe (contra um hash falso).
    // Assim a resposta demora o mesmo tempo nos dois casos e um atacante
    // não descobre quais logins existem medindo o tempo de resposta.
    const senhaConfere = await this.senhaService.conferir(usuario?.senhaHash, dados.senha);

    if (!usuario || !usuario.ativo || !senhaConfere) {
      // No log vai o login tentado, NUNCA a senha
      this.logger.warn(`Falha de login para "${dados.login}"`);
      // Mesma mensagem para todos os casos: não revela se o login existe
      throw new UnauthorizedException('Login ou senha inválidos');
    }

    const payload: PayloadToken = { sub: usuario.id, papel: usuario.papel };
    const accessToken = await this.jwtService.signAsync(payload);

    return {
      accessToken,
      expiraEmSegundos: this.config.get('JWT_ACCESS_TTL_SEGUNDOS', { infer: true }),
      usuario: await this.carregarSessao(usuario.id),
    };
  }

  /** Dados do usuário e das lojas que ele pode acessar. */
  async carregarSessao(usuarioId: string): Promise<UsuarioSessao> {
    const usuario = await this.prisma.usuario.findUniqueOrThrow({
      where: { id: usuarioId },
      include: { lojas: { include: { loja: true } } },
    });

    // O administrador enxerga todas as lojas ativas; os demais, só as vinculadas
    const lojas =
      usuario.papel === 'ADMINISTRADOR'
        ? await this.prisma.loja.findMany({ where: { ativa: true }, orderBy: { codigo: 'asc' } })
        : usuario.lojas
            .map((vinculo) => vinculo.loja)
            .filter((loja) => loja.ativa)
            .sort((a, b) => a.codigo.localeCompare(b.codigo));

    return {
      id: usuario.id,
      nome: usuario.nome,
      papel: usuario.papel,
      lojas: lojas.map(({ id, codigo, nome }) => ({ id, codigo, nome })),
    };
  }
}
