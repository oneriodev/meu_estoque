import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type {
  LoginRequest,
  LoginResponse,
  PapelUsuario,
  TokensResponse,
  UsuarioSessao,
} from '@meu-estoque/shared';
import type { PayloadToken } from '../../common/auth/usuario-autenticado.js';
import type { Env } from '../../config/env.schema.js';
import { PrismaService } from '../../database/prisma.service.js';
import { SenhaService } from './senha.service.js';
import { SessaoService } from './sessao.service.js';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly senhaService: SenhaService,
    private readonly sessaoService: SessaoService,
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

    const refresh = await this.sessaoService.criar(usuario.id, dados.dispositivo);

    return {
      ...(await this.gerarAccessToken(usuario.id, usuario.papel)),
      ...refresh,
      usuario: await this.carregarSessao(usuario.id),
    };
  }

  /** Troca o refresh token por um par novo, sem pedir a senha. */
  async renovar(refreshToken: string): Promise<TokensResponse> {
    const { usuarioId, ...refresh } = await this.sessaoService.renovar(refreshToken);

    // O perfil é lido de novo do banco: se o gestor mudou o papel do usuário,
    // a mudança vale a partir da próxima renovação (no máximo 15 minutos)
    const usuario = await this.prisma.usuario.findUniqueOrThrow({
      where: { id: usuarioId },
      select: { papel: true },
    });

    return { ...(await this.gerarAccessToken(usuarioId, usuario.papel)), ...refresh };
  }

  logout(refreshToken: string): Promise<void> {
    return this.sessaoService.encerrar(refreshToken);
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

  private async gerarAccessToken(
    usuarioId: string,
    papel: PapelUsuario,
  ): Promise<{ accessToken: string; expiraEmSegundos: number }> {
    const payload: PayloadToken = { sub: usuarioId, papel };
    return {
      accessToken: await this.jwtService.signAsync(payload),
      expiraEmSegundos: this.config.get('JWT_ACCESS_TTL_SEGUNDOS', { infer: true }),
    };
  }
}
