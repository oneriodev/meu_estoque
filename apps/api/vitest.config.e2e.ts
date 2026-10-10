import { defineConfig } from 'vitest/config';

// Testes ponta a ponta (e2e): sobem a aplicação e fazem requisições HTTP reais
export default defineConfig({
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
  },
});
