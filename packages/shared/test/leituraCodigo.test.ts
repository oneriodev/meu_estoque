import { describe, expect, it } from 'vitest';
import { calcularDigitoVerificador } from '../src/codigoBarras.js';
import {
  completarEan13,
  converterDataGs1,
  interpretarCodigo,
  variantesGtin,
  type ConfiguracaoBalanca,
} from '../src/leituraCodigo.js';

// Data de referência fixa: o resultado não pode depender do dia em que o teste roda
const HOJE = new Date('2026-10-12T12:00:00Z');
const GS = '\u001d';

/** GTIN-14 válido a partir de 13 dígitos (calcula o verificador). */
const gtin14 = (trezeDigitos: string) => trezeDigitos + calcularDigitoVerificador(trezeDigitos);

// Todos os códigos usam o prefixo 04 (uso interno GS1): nenhum produto real
const EAN13 = completarEan13('040000000001'); // 0400000000015
const GTIN14 = gtin14('1040000000001');

describe('GTIN (EAN-13, EAN-8, UPC-A, GTIN-14)', () => {
  it('reconhece EAN-13 válido', () => {
    expect(interpretarCodigo(EAN13)).toEqual({ tipo: 'GTIN', codigo: EAN13, formato: 'EAN13' });
  });

  it('reconhece EAN-8, UPC-A e GTIN-14 pelo tamanho', () => {
    const ean8 = '0400000' + calcularDigitoVerificador('0400000');
    const upca = '04000000001' + calcularDigitoVerificador('04000000001');
    expect(interpretarCodigo(ean8)).toMatchObject({ tipo: 'GTIN', formato: 'EAN8' });
    expect(interpretarCodigo(upca)).toMatchObject({ tipo: 'GTIN', formato: 'UPCA' });
    expect(interpretarCodigo(GTIN14)).toMatchObject({ tipo: 'GTIN', formato: 'GTIN14' });
  });

  it('recusa dígito verificador errado (leitura ruim)', () => {
    const errado = EAN13.slice(0, -1) + ((Number(EAN13.at(-1)) + 1) % 10);
    expect(interpretarCodigo(errado)).toMatchObject({
      tipo: 'INVALIDO',
      motivo: 'Dígito verificador inválido',
    });
  });

  it('recusa tamanho e caracteres inválidos', () => {
    expect(interpretarCodigo('12345')).toMatchObject({ tipo: 'INVALIDO' });
    expect(interpretarCodigo('ABC123')).toMatchObject({ tipo: 'INVALIDO' });
    expect(interpretarCodigo('   ')).toMatchObject({ tipo: 'INVALIDO', motivo: 'Código vazio' });
  });

  it('ignora o Enter que o coletor manda no fim', () => {
    expect(interpretarCodigo(`${EAN13}\r\n`)).toMatchObject({ tipo: 'GTIN', codigo: EAN13 });
  });
});

describe('etiqueta de balança', () => {
  it('padrão: 2 + código (6) + preço em centavos (5) + verificador', () => {
    const codigo = completarEan13('2' + '000123' + '01990');
    expect(interpretarCodigo(codigo)).toEqual({
      tipo: 'BALANCA',
      codigo,
      codigoProduto: '123',
      tipoValor: 'PRECO',
      valor: '19.90',
    });
  });

  it('preço abaixo de R$ 1,00 mantém o zero antes da vírgula', () => {
    const codigo = completarEan13('2' + '000123' + '00099');
    expect(interpretarCodigo(codigo)).toMatchObject({ valor: '0.99' });
  });

  it('configuração da loja: código de 5 dígitos e peso em gramas', () => {
    const config: ConfiguracaoBalanca = { prefixos: ['2'], digitosCodigo: 5, tipoValor: 'PESO' };
    const codigo = completarEan13('2' + '00456' + '001250'); // 1,250 kg
    expect(interpretarCodigo(codigo, config)).toMatchObject({
      tipo: 'BALANCA',
      codigoProduto: '456',
      tipoValor: 'PESO',
      valor: '1.250',
    });
  });

  it('etiqueta de balança com verificador errado é recusada', () => {
    const codigo = completarEan13('2' + '000123' + '01990');
    const errado = codigo.slice(0, -1) + ((Number(codigo.at(-1)) + 1) % 10);
    expect(interpretarCodigo(errado)).toMatchObject({ tipo: 'INVALIDO' });
  });
});

describe('GS1-128 / DataMatrix (GTIN + validade + lote)', () => {
  it('lê os campos separados pelo caractere GS, com prefixo de simbologia', () => {
    const lido = interpretarCodigo(
      `]C101${GTIN14}17271130` + `10LOTE42${GS}21SERIE9`,
      undefined,
      HOJE,
    );
    expect(lido).toEqual({
      tipo: 'GS1',
      codigo: `]C101${GTIN14}1727113010LOTE42${GS}21SERIE9`,
      gtin: GTIN14,
      lote: 'LOTE42',
      validade: '2027-11-30',
      pesoKg: null,
      quantidade: null,
    });
  });

  it('lê a forma legível com parênteses', () => {
    expect(interpretarCodigo(`(01)${GTIN14}(17)261231(10)A-77`, undefined, HOJE)).toMatchObject({
      tipo: 'GS1',
      gtin: GTIN14,
      validade: '2026-12-31',
      lote: 'A-77',
    });
  });

  it('coletor sem separador: lote no fim continua legível', () => {
    expect(interpretarCodigo(`01${GTIN14}1726113010L9`, undefined, HOJE)).toMatchObject({
      tipo: 'GS1',
      validade: '2026-11-30',
      lote: 'L9',
    });
  });

  it('peso líquido (3103): 001250 = 1,250 kg', () => {
    expect(interpretarCodigo(`01${GTIN14}3103001250`, undefined, HOJE)).toMatchObject({
      pesoKg: '1.250',
    });
  });

  it('sem a AI 17, usa a 15 (consumir preferencialmente antes de)', () => {
    expect(interpretarCodigo(`01${GTIN14}15270115`, undefined, HOJE)).toMatchObject({
      validade: '2027-01-15',
    });
  });

  it('GTIN (01) com verificador errado é recusado', () => {
    const errado = GTIN14.slice(0, -1) + ((Number(GTIN14.at(-1)) + 1) % 10);
    expect(interpretarCodigo(`]C101${errado}17271130`, undefined, HOJE)).toMatchObject({
      tipo: 'INVALIDO',
    });
  });

  it('data impossível (mês 13) é recusada', () => {
    expect(interpretarCodigo(`]C101${GTIN14}17271330`, undefined, HOJE)).toMatchObject({
      tipo: 'INVALIDO',
      motivo: 'Data inválida: 271330',
    });
  });
});

describe('datas GS1 (AAMMDD)', () => {
  it('dia 00 = último dia do mês, inclusive em ano bissexto', () => {
    expect(converterDataGs1('280200', HOJE)).toBe('2028-02-29');
    expect(converterDataGs1('270200', HOJE)).toBe('2027-02-28');
  });

  it('janela de século da GS1', () => {
    expect(converterDataGs1('991231', HOJE)).toBe('1999-12-31'); // 73 anos à frente: século passado
    expect(converterDataGs1('751231', HOJE)).toBe('2075-12-31'); // 49 anos à frente: este século
  });

  it('dia inexistente é recusado', () => {
    expect(converterDataGs1('270231', HOJE)).toBeNull(); // 31 de fevereiro
  });
});

describe('variantes de GTIN para a busca', () => {
  it('o mesmo produto em 13 e 14 dígitos', () => {
    expect(variantesGtin('0' + EAN13.slice(1))).toContain(EAN13.padStart(14, '0'));
    expect(variantesGtin(EAN13.padStart(14, '0'))).toContain(EAN13);
  });
});
