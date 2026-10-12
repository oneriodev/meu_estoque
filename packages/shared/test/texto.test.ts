import { describe, expect, it } from 'vitest';
import { normalizarBusca, palavrasDaBusca } from '../src/texto.js';

describe('normalização para busca', () => {
  it('remove acentos e cedilha, e passa para minúsculas', () => {
    expect(normalizarBusca('Feijão Carioca')).toBe('feijao carioca');
    expect(normalizarBusca('AÇÚCAR cristal')).toBe('acucar cristal');
    expect(normalizarBusca('Água sanitária')).toBe('agua sanitaria');
  });

  it('junta espaços repetidos e apara as pontas', () => {
    expect(normalizarBusca('  leite   UHT  ')).toBe('leite uht');
  });

  it('separa as palavras da busca', () => {
    expect(palavrasDaBusca(' Feijão  1kg ')).toEqual(['feijao', '1kg']);
    expect(palavrasDaBusca('   ')).toEqual([]);
  });
});
