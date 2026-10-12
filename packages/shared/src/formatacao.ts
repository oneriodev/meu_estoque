/**
 * Formatação para exibir ao usuário (padrão brasileiro). Usada no app e no painel web.
 * Valores decimais chegam como TEXTO ("1234.5") e são formatados SEM passar por float.
 */

/** "1234.5" → "1.234,50" (casas fixas, separador de milhar). */
export function formatarDecimal(texto: string, casas: number): string {
  const negativo = texto.trim().startsWith('-');
  const [inteiroBruto = '0', fracaoBruta = ''] = texto.trim().replace('-', '').split('.');
  const inteiro = (inteiroBruto.replace(/^0+(?=\d)/, '') || '0').replace(
    /\B(?=(\d{3})+(?!\d))/g, // a cada 3 dígitos, contando da direita
    '.',
  );
  const fracao = fracaoBruta.padEnd(casas, '0').slice(0, casas);
  const resultado = casas > 0 ? `${inteiro},${fracao}` : inteiro;
  const zero = /^[0.,]+$/.test(resultado);
  return negativo && !zero ? `-${resultado}` : resultado;
}

/** "28.79" → "R$ 28,79". Vazio vira "—". */
export function formatarMoeda(texto: string | null | undefined): string {
  if (texto === null || texto === undefined || texto === '') return '—';
  return `R$ ${formatarDecimal(texto, 2)}`;
}

/** Saldo: "18.000" + UN → "18 un"; "1.250" + KG → "1,250 kg". */
export function formatarQuantidade(texto: string | null | undefined, unidade: 'UN' | 'KG'): string {
  if (texto === null || texto === undefined || texto === '') return '—';
  return unidade === 'KG' ? `${formatarDecimal(texto, 3)} kg` : `${formatarDecimal(texto, 0)} un`;
}

/** "2026-11-30" → "30/11/2026". */
export function formatarData(iso: string): string {
  const [ano, mes, dia] = iso.slice(0, 10).split('-');
  return `${dia}/${mes}/${ano}`;
}

/**
 * Dias de hoje até a data (negativo = já passou). Conta dias de CALENDÁRIO no fuso
 * do aparelho: um produto que vence hoje dá 0, mesmo às 23h.
 */
export function diasAte(iso: string, hoje: Date = new Date()): number {
  const [ano, mes, dia] = iso.slice(0, 10).split('-').map(Number);
  const alvo = Date.UTC(ano ?? 0, (mes ?? 1) - 1, dia ?? 1);
  const inicioHoje = Date.UTC(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  return Math.round((alvo - inicioHoje) / 86_400_000);
}
