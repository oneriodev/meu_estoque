import { defineConfig } from 'vitest/config';

// Testes unitários: arquivos *.spec.ts ao lado do código (src/)
export default defineConfig({
  test: {
    globals: true, // describe/it/expect sem precisar importar
    root: './',
    include: ['**/*.spec.ts'],
  },
});
