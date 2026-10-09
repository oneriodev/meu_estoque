import { z } from 'zod';

/**
 * Confere o dígito verificador de um código GTIN.
 * Regra GS1: da direita para a esquerda (sem contar o verificador),
 * os dígitos recebem pesos 3, 1, 3, 1... O verificador é o número
 * que completa a soma até o próximo múltiplo de 10.
 */
export function digitoVerificadorValido(codigo: string): boolean {
  if (!/^\d+$/.test(codigo)) return false;

  const digitos = codigo.split('').map(Number);
  const verificador = digitos.pop(); // tipo: number | undefined

  const soma = digitos
    .reverse()
    .reduce((acumulado, digito, i) => acumulado + digito * (i % 2 === 0 ? 3 : 1), 0);

  return (10 - (soma % 10)) % 10 === verificador;
}

export const gtinSchema = z
  .string()
  .trim()
  .regex(/^(\d{8}|\d{12}|\d{13}|\d{14})$/, 'O código deve ter 8, 12, 13 ou 14 dígitos')
  .refine(digitoVerificadorValido, 'Dígito verificador inválido');

export type Gtin = z.infer<typeof gtinSchema>;
