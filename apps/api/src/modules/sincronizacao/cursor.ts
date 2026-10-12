import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';

/** As entidades do pull, NA ORDEM em que são enviadas (categorias antes de produtos etc.). */
export const ENTIDADES_PULL = ['categorias', 'produtos', 'eans', 'produtosLoja', 'lotes'] as const;
export type EntidadePull = (typeof ENTIDADES_PULL)[number];

/**
 * Marca d'água de uma entidade: o último registro que o aparelho já recebeu.
 * Ordenamos por (atualizadoEm, id). O id desempata registros com o mesmo horário,
 * senão um deles poderia ser pulado na virada de página.
 */
const marcaSchema = z.object({ em: z.iso.datetime(), id: z.string().min(1).max(100) }).nullable();
export type Marca = z.infer<typeof marcaSchema>;

const cursorSchema = z.object({
  v: z.literal(1),
  /** O cursor vale só para a loja em que foi gerado */
  loja: z.uuid(),
  marcas: z.object({
    categorias: marcaSchema,
    produtos: marcaSchema,
    eans: marcaSchema,
    produtosLoja: marcaSchema,
    lotes: marcaSchema,
  }),
});
export type Marcas = z.infer<typeof cursorSchema>['marcas'];

export function marcasIniciais(): Marcas {
  return { categorias: null, produtos: null, eans: null, produtosLoja: null, lotes: null };
}

/**
 * O cursor é "opaco": um JSON em base64url que o aparelho só guarda e devolve.
 * Assim podemos mudar o formato interno sem mexer no app (o campo "v" é a versão).
 */
export function codificarCursor(lojaId: string, marcas: Marcas): string {
  return Buffer.from(JSON.stringify({ v: 1, loja: lojaId, marcas })).toString('base64url');
}

/**
 * O cursor vem do cliente, então é ENTRADA NÃO CONFIÁVEL: decodificamos e validamos com Zod.
 * Adulterá-lo não dá acesso a nada novo: ele só escolhe "a partir de onde" listar,
 * sempre dentro da loja que o EscopoLojaGuard já autorizou.
 */
export function decodificarCursor(cursor: string, lojaId: string): Marcas {
  let conteudo: unknown;
  try {
    conteudo = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
  } catch {
    throw new BadRequestException('Cursor inválido');
  }
  const resultado = cursorSchema.safeParse(conteudo);
  if (!resultado.success) throw new BadRequestException('Cursor inválido');
  if (resultado.data.loja !== lojaId) {
    // Ex.: o operador trocou de loja. O app deve descartar o cursor e fazer a carga inicial.
    throw new BadRequestException('Cursor pertence a outra loja');
  }
  return resultado.data.marcas;
}
