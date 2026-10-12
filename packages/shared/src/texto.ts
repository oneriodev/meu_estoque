/**
 * Prepara um texto para busca: minúsculas, sem acentos e sem espaços repetidos.
 * Assim "FEIJÃO  Carioca" e "feijao carioca" ficam iguais.
 *
 * Como funciona a remoção de acento: a normalização "NFD" separa a letra do acento
 * ("ã" vira "a" + "~"), e a expressão regular apaga as marcas de acento (faixa Unicode
 * U+0300 a U+036F, os "diacríticos combinantes").
 */
export function normalizarBusca(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Quebra a busca em palavras: "feijao 1kg" → ["feijao", "1kg"]. */
export function palavrasDaBusca(texto: string): string[] {
  return normalizarBusca(texto).split(' ').filter(Boolean);
}
