import { SetMetadata } from '@nestjs/common';

export const PARAMETRO_LOJA = 'parametroLoja';

/**
 * A rota trabalha com dados de UMA loja, indicada no caminho (ex.: /lojas/:lojaId).
 * O EscopoLojaGuard confere se o usuário tem acesso a ela.
 * Uso: @ExigeLoja() ou @ExigeLoja('outroNomeDoParametro')
 */
export const ExigeLoja = (parametro = 'lojaId') => SetMetadata(PARAMETRO_LOJA, parametro);
