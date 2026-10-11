/**
 * Números "aleatórios" REPRODUZÍVEIS: a mesma semente gera sempre a mesma sequência.
 * Assim o catálogo fictício é idêntico em toda máquina e em todo teste.
 */

/** Transforma um texto em um número inteiro (hash FNV-1a de 32 bits). */
export function hashTexto(texto: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < texto.length; i++) {
    hash ^= texto.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** Gerador mulberry32: rápido, simples e determinístico. Devolve números entre 0 e 1. */
export function criarGerador(semente: string): () => number {
  let estado = hashTexto(semente);
  return () => {
    estado = (estado + 0x6d2b79f5) >>> 0;
    let t = estado;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

/** Inteiro entre minimo e maximo (inclusive). */
export function inteiroEntre(gerador: () => number, minimo: number, maximo: number): number {
  return minimo + Math.floor(gerador() * (maximo - minimo + 1));
}
