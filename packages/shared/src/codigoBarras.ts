import { z } from 'zod';

/**
 * Calcula o dígito verificador de um código GTIN (sem o dígito).
 * Regra GS1: da direita para a esquerda, os dígitos recebem pesos 3, 1, 3, 1...
 * O verificador é o número que completa a soma até o próximo múltiplo de 10.
 */
export function calcularDigitoVerificador(semDigito: string): number {
  if (!/^\d+$/.test(semDigito)) {
    throw new Error('O código deve conter apenas dígitos');
  }

  const soma = semDigito
    .split('')
    .map(Number)
    .reverse()
    .reduce((acumulado, digito, i) => acumulado + digito * (i % 2 === 0 ? 3 : 1), 0);

  return (10 - (soma % 10)) % 10;
}

/** Confere o dígito verificador de um código GTIN completo. */
export function digitoVerificadorValido(codigo: string): boolean {
  if (!/^\d{2,}$/.test(codigo)) return false;
  const verificador = Number(codigo.slice(-1));
  return calcularDigitoVerificador(codigo.slice(0, -1)) === verificador;
}

export const gtinSchema = z
  .string()
  .trim()
  .regex(/^(\d{8}|\d{12}|\d{13}|\d{14})$/, 'O código deve ter 8, 12, 13 ou 14 dígitos')
  .refine(digitoVerificadorValido, 'Dígito verificador inválido');

export type Gtin = z.infer<typeof gtinSchema>;
