import { Body, Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  loginRequestSchema,
  refreshRequestSchema,
  type LoginRequest,
  type LoginResponse,
  type RefreshRequest,
  type TokensResponse,
  type UsuarioSessao,
} from '@meu-estoque/shared';
import { Public } from '../../common/auth/public.decorator.js';
import { UsuarioAtual } from '../../common/auth/usuario-atual.decorator.js';
import type { UsuarioAutenticado } from '../../common/auth/usuario-autenticado.js';
import { AuthService } from './auth.service.js';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  // No máximo 5 tentativas por minuto por IP: dificulta adivinhar senhas
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('login')
  @HttpCode(HttpStatus.OK) // login não cria nada, então 200 em vez do 201 padrão do POST
  @ApiOperation({ summary: 'Entra com login e senha e recebe os tokens' })
  @ApiOkResponse({ description: 'Login feito' })
  @ApiUnauthorizedResponse({ description: 'Login ou senha inválidos' })
  @ApiTooManyRequestsResponse({ description: 'Muitas tentativas. Aguarde um minuto.' })
  login(@Body({ schema: loginRequestSchema }) dados: LoginRequest): Promise<LoginResponse> {
    // Quando chega aqui, o corpo já foi validado e transformado pelo Zod
    return this.authService.login(dados);
  }

  // Público: quando o app renova, o token de acesso normalmente já venceu
  @Public()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Troca o refresh token por um par novo de tokens' })
  @ApiOkResponse({ description: 'Tokens renovados. O refresh token antigo deixa de valer.' })
  @ApiUnauthorizedResponse({ description: 'Sessão inválida, expirada ou encerrada' })
  renovar(@Body({ schema: refreshRequestSchema }) dados: RefreshRequest): Promise<TokensResponse> {
    return this.authService.renovar(dados.refreshToken);
  }

  @Public()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT) // 204: deu certo e não há nada para devolver
  @ApiOperation({ summary: 'Encerra a sessão deste aparelho' })
  @ApiNoContentResponse({ description: 'Sessão encerrada' })
  logout(@Body({ schema: refreshRequestSchema }) dados: RefreshRequest): Promise<void> {
    return this.authService.logout(dados.refreshToken);
  }

  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Dados do usuário logado e das lojas que ele acessa' })
  @ApiOkResponse({ description: 'Sessão atual' })
  @ApiUnauthorizedResponse({ description: 'Sem token ou token inválido' })
  me(@UsuarioAtual() usuario: UsuarioAutenticado): Promise<UsuarioSessao> {
    return this.authService.carregarSessao(usuario.id);
  }
}
