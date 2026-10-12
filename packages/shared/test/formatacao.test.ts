import { describe, expect, it } from 'vitest';
import {
  diasAte,
  formatarData,
  formatarDataHora,
  formatarDecimal,
  formatarMoeda,
  formatarQuantidade,
} from '../src/formatacao.js';

describe('formatação brasileira', () => {
  it('moeda com milhar e centavos, sem float', () => {
    expect(formatarMoeda('28.79')).toBe('R$ 28,79');
    expect(formatarMoeda('1234.5')).toBe('R$ 1.234,50');
    expect(formatarMoeda('0.1')).toBe('R$ 0,10');
    expect(formatarMoeda(null)).toBe('—');
  });

  it('valores negativos (estoque negativo)', () => {
    expect(formatarDecimal('-3.000', 0)).toBe('-3');
    expect(formatarDecimal('-0.000', 0)).toBe('0');
  });

  it('quantidade por unidade de venda', () => {
    expect(formatarQuantidade('18.000', 'UN')).toBe('18 un');
    expect(formatarQuantidade('1.25', 'KG')).toBe('1,250 kg');
    expect(formatarQuantidade('1250.5', 'KG')).toBe('1.250,500 kg');
  });

  it('data no formato dia/mês/ano', () => {
    expect(formatarData('2026-11-30')).toBe('30/11/2026');
  });

  it('dias até a validade, em dias de calendário', () => {
    const hoje = new Date(2026, 9, 12, 23, 30); // 12/10/2026 às 23h30, no fuso local
    expect(diasAte('2026-10-12', hoje)).toBe(0);
    expect(diasAte('2026-10-19', hoje)).toBe(7);
    expect(diasAte('2026-10-10', hoje)).toBe(-2);
    expect(diasAte('2027-10-12', hoje)).toBe(365);
  });
  it('formatarDataHora usa o fuso do aparelho', () => {
    const instante = new Date(2026, 9, 12, 18, 5); // 12/10/2026 18:05 no fuso local
    expect(formatarDataHora(instante.toISOString())).toBe('12/10/2026 18:05');
  });
});
