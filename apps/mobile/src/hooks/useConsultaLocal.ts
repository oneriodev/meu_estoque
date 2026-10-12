import { useMemo } from 'react';
import { useSincronizacaoStore } from '@/stores/sincronizacaoStore';

/**
 * Consulta ao banco do aparelho que se refaz sozinha quando o banco muda
 * (pull concluído, evento novo na outbox...), além de quando as "chaves" mudam.
 *
 * Por que o 'use no memo'? O React Compiler (ligado no app.json) memoriza tudo
 * automaticamente, deduzindo as dependências do que o código USA. Ele supõe que
 * funções são "puras": detalharProduto(id) com o mesmo id daria sempre o mesmo resultado.
 * Para o banco local isso não vale (o mesmo id traz dados novos após o pull), então
 * desligamos o compilador SÓ aqui e controlamos as dependências à mão, com a "versao".
 */
export function useConsultaLocal<T>(consultar: () => T, chaves: readonly unknown[]): T {
  'use no memo';
  const versao = useSincronizacaoStore((s) => s.versao);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- dependências controladas à mão (ver acima)
  return useMemo(consultar, [versao, ...chaves]);
}
