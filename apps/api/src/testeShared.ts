// "type" no import indica que PapelUsuario é só um tipo:
// ele desaparece no JavaScript final.
import { gtinSchema, papelUsuarioSchema, type PapelUsuario } from '@meu-estoque/shared';

const papel: PapelUsuario = 'SUPERVISOR';
console.log('Papel válido?', papelUsuarioSchema.safeParse(papel).success);

for (const codigo of ['7891000100103', '7891000100104', '123']) {
  // safeParse não lança exceção: devolve { success, data } ou { success, error }
  const resultado = gtinSchema.safeParse(codigo);
  console.log(codigo, '→', resultado.success ? 'OK' : resultado.error.issues[0]?.message);
}
