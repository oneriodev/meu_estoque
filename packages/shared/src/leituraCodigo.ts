import { calcularDigitoVerificador, digitoVerificadorValido } from './codigoBarras.js';

/**
 * Interpretação do que o leitor (câmera ou coletor) entregou.
 *
 * Um supermercado convive com três famílias de código:
 * 1. GTIN (EAN-13, EAN-8, UPC-A, GTIN-14 da caixa): identifica SÓ o produto.
 * 2. Etiqueta de balança (começa com 2): código interno do produto + preço ou peso.
 * 3. GS1-128 / GS1 DataMatrix: vários dados num código só (GTIN, LOTE, VALIDADE, peso...),
 *    cada um precedido por um "Identificador de Aplicação" (AI), como (01), (17), (10).
 *
 * Tudo aqui é função pura (sem banco, sem tela): fácil de testar e igual no app e na API.
 */

/** Como a balança da loja monta a etiqueta. Varia por loja e vem dos parâmetros (Etapa 10). */
export interface ConfiguracaoBalanca {
  /** Primeiros dígitos que indicam etiqueta de balança. GS1 reserva 20 a 29 para uso interno. */
  prefixos: string[];
  /** Quantos dígitos do código interno do produto vêm depois do prefixo */
  digitosCodigo: number;
  /** O que vem depois do código: preço total (em centavos) ou peso (em gramas) */
  tipoValor: 'PRECO' | 'PESO';
}

/**
 * Padrão mais comum nas balanças brasileiras: 2 + código (6) + preço em centavos (5) + verificador.
 * Ex.: 2 000123 01990 D → produto 123, R$ 19,90.
 */
export const BALANCA_PADRAO: ConfiguracaoBalanca = {
  prefixos: ['2'],
  digitosCodigo: 6,
  tipoValor: 'PRECO',
};

export type FormatoGtin = 'EAN8' | 'UPCA' | 'EAN13' | 'GTIN14';

export type LeituraCodigo =
  | { tipo: 'GTIN'; codigo: string; formato: FormatoGtin }
  | {
      tipo: 'BALANCA';
      codigo: string;
      /** Código interno do produto, sem zeros à esquerda (ex.: "123") */
      codigoProduto: string;
      tipoValor: 'PRECO' | 'PESO';
      /** Texto decimal exato: "19.90" (reais) ou "1.250" (kg). Nunca float. */
      valor: string;
    }
  | {
      tipo: 'GS1';
      codigo: string;
      gtin: string | null;
      lote: string | null;
      /** "AAAA-MM-DD", da AI 17 (validade) ou, na falta dela, da 15 (consumir preferencialmente) */
      validade: string | null;
      /** Peso líquido em kg (AI 310n), texto decimal */
      pesoKg: string | null;
      /** Quantidade (AI 30 ou 37) */
      quantidade: string | null;
    }
  | { tipo: 'INVALIDO'; codigo: string; motivo: string };

/** Separador GS (ASCII 29): marca o fim de um campo de tamanho variável no GS1-128/DataMatrix. */
const GS = '\u001d';

/**
 * Prefixos de simbologia que alguns leitores colocam antes do código:
 * ]C1 = GS1-128, ]d2 = GS1 DataMatrix, ]Q3 = GS1 QR, ]e0 = GS1 DataBar.
 */
const PREFIXO_SIMBOLOGIA_GS1 = /^\](C1|d2|Q3|e0)/;

const FORMATOS_POR_TAMANHO: Record<number, FormatoGtin> = {
  8: 'EAN8',
  12: 'UPCA',
  13: 'EAN13',
  14: 'GTIN14',
};

/** Ponto de entrada: decide que tipo de código é e extrai os dados. */
export function interpretarCodigo(
  entrada: string,
  balanca: ConfiguracaoBalanca = BALANCA_PADRAO,
  hoje: Date = new Date(),
): LeituraCodigo {
  // Coletores em modo teclado costumam mandar Enter/Tab no fim
  const codigo = entrada.replace(/[\r\n\t]+$/g, '').trim();
  if (codigo === '') return { tipo: 'INVALIDO', codigo, motivo: 'Código vazio' };

  if (pareceGs1(codigo)) return interpretarGs1(codigo, hoje);

  if (!/^\d+$/.test(codigo)) {
    return { tipo: 'INVALIDO', codigo, motivo: 'O código deve conter apenas dígitos' };
  }
  const formato = FORMATOS_POR_TAMANHO[codigo.length];
  if (!formato) {
    return { tipo: 'INVALIDO', codigo, motivo: `Tamanho inválido (${codigo.length} dígitos)` };
  }
  if (!digitoVerificadorValido(codigo)) {
    // Quase sempre é uma leitura ruim: o app pede para ler de novo
    return { tipo: 'INVALIDO', codigo, motivo: 'Dígito verificador inválido' };
  }

  if (formato === 'EAN13' && balanca.prefixos.some((prefixo) => codigo.startsWith(prefixo))) {
    return interpretarBalanca(codigo, balanca);
  }
  return { tipo: 'GTIN', codigo, formato };
}

/**
 * Etiqueta de balança: [prefixo][código do produto][valor][verificador].
 * ATENÇÃO: algumas lojas usam códigos começando com 2 também para produtos embalados
 * na própria loja, com preço fixo. Por isso a busca sempre tenta primeiro o código
 * inteiro como EAN cadastrado, e só depois interpreta como balança.
 */
function interpretarBalanca(codigo: string, balanca: ConfiguracaoBalanca): LeituraCodigo {
  const prefixo = balanca.prefixos.find((p) => codigo.startsWith(p)) ?? '';
  const inicioValor = prefixo.length + balanca.digitosCodigo;
  const codigoProduto = codigo.slice(prefixo.length, inicioValor).replace(/^0+(?=\d)/, '');
  const digitosValor = codigo.slice(inicioValor, 12); // o 13º é o verificador
  const casas = balanca.tipoValor === 'PRECO' ? 2 : 3; // centavos → reais; gramas → kg
  return {
    tipo: 'BALANCA',
    codigo,
    codigoProduto,
    tipoValor: balanca.tipoValor,
    valor: inserirVirgulaDecimal(digitosValor, casas),
  };
}

// ─── GS1-128 / GS1 DataMatrix ─────────────────────────────────────────────────

/** Definição de um Identificador de Aplicação: tamanho fixo ou variável (com máximo). */
interface DefinicaoAi {
  fixo?: number;
  maximo?: number;
}

/**
 * Os AIs que interessam a um supermercado (lista completa: GS1 General Specifications).
 * Os de 4 dígitos (310n, 392n...) têm o último dígito como "casas decimais".
 */
const AIS: Record<string, DefinicaoAi> = {
  '00': { fixo: 18 }, // SSCC (palete)
  '01': { fixo: 14 }, // GTIN do item
  '02': { fixo: 14 }, // GTIN dos itens contidos
  '10': { maximo: 20 }, // LOTE
  '11': { fixo: 6 }, // data de fabricação
  '13': { fixo: 6 }, // data de embalagem
  '15': { fixo: 6 }, // consumir preferencialmente antes de
  '17': { fixo: 6 }, // VALIDADE
  '20': { fixo: 2 }, // variante
  '21': { maximo: 20 }, // número de série
  '30': { maximo: 8 }, // quantidade variável
  '37': { maximo: 8 }, // quantidade de itens contidos
};
const AIS_4_DIGITOS: Record<string, DefinicaoAi> = {
  '310': { fixo: 6 }, // peso líquido em kg, 3100 a 3105
  '320': { fixo: 6 }, // peso líquido em libras
  '392': { maximo: 15 }, // preço a pagar
  '393': { maximo: 18 }, // preço a pagar com moeda
};

function pareceGs1(codigo: string): boolean {
  if (PREFIXO_SIMBOLOGIA_GS1.test(codigo) || codigo.includes(GS)) return true;
  if (/^\(\d{2,4}\)/.test(codigo)) return true; // forma legível: (01)...(17)...
  // Coletor em modo teclado sem separador: começa com (01) + GTIN-14 válido e continua
  return (
    /^01\d{14}\d+/.test(codigo) &&
    digitoVerificadorValido(codigo.slice(2, 16)) &&
    codigo.length > 16
  );
}

function interpretarGs1(entrada: string, hoje: Date): LeituraCodigo {
  const campos = new Map<string, string>();
  let problema: string | null = null;

  if (/^\(\d{2,4}\)/.test(entrada)) {
    // Forma legível, impressa embaixo das barras: (01)07891234567895(17)261130(10)L42
    for (const [, ai, valor] of entrada.matchAll(/\((\d{2,4})\)([^(]*)/g)) {
      if (ai !== undefined && valor !== undefined) campos.set(ai, valor);
    }
  } else {
    let resto = entrada.replace(PREFIXO_SIMBOLOGIA_GS1, '');
    while (resto.length > 0) {
      if (resto.startsWith(GS)) {
        resto = resto.slice(1);
        continue;
      }
      const lido = lerProximoAi(resto);
      if (!lido) {
        problema = `Identificador de aplicação desconhecido em "${resto.slice(0, 4)}"`;
        break;
      }
      campos.set(lido.ai, lido.valor);
      resto = lido.resto;
    }
  }

  if (campos.size === 0) {
    return { tipo: 'INVALIDO', codigo: entrada, motivo: problema ?? 'Código GS1 vazio' };
  }

  const gtin = campos.get('01') ?? null;
  if (gtin !== null && (!/^\d{14}$/.test(gtin) || !digitoVerificadorValido(gtin))) {
    return { tipo: 'INVALIDO', codigo: entrada, motivo: 'GTIN (01) inválido' };
  }

  const dataBruta = campos.get('17') ?? campos.get('15') ?? null;
  const validade = dataBruta !== null ? converterDataGs1(dataBruta, hoje) : null;
  if (dataBruta !== null && validade === null) {
    return { tipo: 'INVALIDO', codigo: entrada, motivo: `Data inválida: ${dataBruta}` };
  }

  const peso = [...campos.entries()].find(([ai]) => /^310\d$/.test(ai));
  return {
    tipo: 'GS1',
    codigo: entrada,
    gtin,
    lote: campos.get('10') ?? null,
    validade,
    pesoKg: peso ? inserirVirgulaDecimal(peso[1], Number(peso[0][3])) : null,
    quantidade: campos.get('30') ?? campos.get('37') ?? null,
  };
}

/** Lê um AI e seu valor do começo do texto. Variáveis terminam no GS ou no fim. */
function lerProximoAi(texto: string): { ai: string; valor: string; resto: string } | null {
  const ai4 = texto.slice(0, 4);
  const definicao4 = /^\d{4}$/.test(ai4) ? AIS_4_DIGITOS[ai4.slice(0, 3)] : undefined;
  const ai2 = texto.slice(0, 2);
  const [ai, definicao] = definicao4 ? [ai4, definicao4] : [ai2, AIS[ai2]];
  if (!definicao) return null;

  const depois = texto.slice(ai.length);
  if (definicao.fixo !== undefined) {
    if (depois.length < definicao.fixo) return null;
    return { ai, valor: depois.slice(0, definicao.fixo), resto: depois.slice(definicao.fixo) };
  }
  const fim = depois.indexOf(GS);
  const valor = fim === -1 ? depois : depois.slice(0, fim);
  if (valor.length === 0 || valor.length > (definicao.maximo ?? Infinity)) return null;
  return { ai, valor, resto: fim === -1 ? '' : depois.slice(fim) };
}

/**
 * Converte AAMMDD (padrão GS1) para "AAAA-MM-DD".
 * - Dia 00 significa "último dia do mês" (regra GS1).
 * - Século pela "janela deslizante" da GS1: anos até 50 à frente ficam neste século,
 *   mais que isso são do século passado (ex.: em 2026, "99" = 1999 e "75" = 2075).
 */
export function converterDataGs1(aammdd: string, hoje: Date = new Date()): string | null {
  if (!/^\d{6}$/.test(aammdd)) return null;
  const aa = Number(aammdd.slice(0, 2));
  const mes = Number(aammdd.slice(2, 4));
  let dia = Number(aammdd.slice(4, 6));
  if (mes < 1 || mes > 12) return null;

  const anoAtual = hoje.getUTCFullYear();
  const seculo = Math.floor(anoAtual / 100) * 100;
  const diferenca = aa - (anoAtual % 100);
  const ano = seculo + aa + (diferenca >= 51 ? -100 : diferenca <= -50 ? 100 : 0);

  // Dia 0 de um mês no Date = último dia do mês anterior; por isso "mes" (e não mes - 1)
  const ultimoDia = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  if (dia === 0) dia = ultimoDia;
  if (dia > ultimoDia) return null;

  return `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

/** "001990" com 2 casas → "19.90". Feito com texto para não passar por float. */
function inserirVirgulaDecimal(digitos: string, casas: number): string {
  if (casas === 0) return String(Number(digitos));
  const preenchido = digitos.padStart(casas + 1, '0');
  const inteiro = preenchido.slice(0, -casas).replace(/^0+(?=\d)/, '');
  return `${inteiro}.${preenchido.slice(-casas)}`;
}

/**
 * Formas do mesmo GTIN que podem estar cadastradas: o ERP pode guardar "7891234567895"
 * enquanto o GS1 entrega "07891234567895" (14 dígitos). A busca tenta todas.
 */
export function variantesGtin(codigo: string): string[] {
  const variantes = new Set<string>([codigo]);
  if (/^\d{8,14}$/.test(codigo)) {
    variantes.add(codigo.padStart(14, '0'));
    let semZeros = codigo;
    while (semZeros.length > 8 && semZeros.startsWith('0')) {
      semZeros = semZeros.slice(1);
      if ([8, 12, 13].includes(semZeros.length)) variantes.add(semZeros);
    }
  }
  return [...variantes];
}

/** Monta um EAN-13 válido a partir dos 12 primeiros dígitos (útil para testes e etiquetas). */
export function completarEan13(dozeDigitos: string): string {
  return dozeDigitos + String(calcularDigitoVerificador(dozeDigitos));
}
