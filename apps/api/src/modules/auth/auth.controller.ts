import { Body, Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  loginRequestSchema,
  type LoginRequest,
  type LoginResponse,
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
  @ApiOperation({ summary: 'Entra com login e senha e recebe o token de acesso' })
  @ApiOkResponse({ description: 'Login feito' })
  @ApiUnauthorizedResponse({ description: 'Login ou senha inválidos' })
  @ApiTooManyRequestsResponse({ description: 'Muitas tentativas. Aguarde um minuto.' })
  login(@Body({ schema: loginRequestSchema }) dados: LoginRequest): Promise<LoginResponse> {
    // Quando chega aqui, o corpo já foi validado e transformado pelo Zod
    return this.authService.login(dados);
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
