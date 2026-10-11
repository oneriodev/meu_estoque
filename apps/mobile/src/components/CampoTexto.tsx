import type { Ref } from 'react';
import { StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import { cores } from '@/theme/cores';

/** Recebe todas as props de um TextInput normal, mais o rótulo e o erro. */
interface CampoTextoProps extends TextInputProps {
  rotulo: string;
  erro?: string | undefined;
  /** No React 19, ref é uma prop comum: a tela pode "segurar" o campo (ex.: focar a senha). */
  ref?: Ref<TextInput>;
}

/** Campo de formulário com rótulo e mensagem de erro. */
export function CampoTexto({ rotulo, erro, style, ref, ...props }: CampoTextoProps) {
  return (
    <View style={estilos.grupo}>
      <Text style={estilos.rotulo}>{rotulo}</Text>
      <TextInput
        ref={ref}
        placeholderTextColor={cores.textoSuave}
        style={[estilos.entrada, erro ? estilos.entradaComErro : null, style]}
        accessibilityLabel={rotulo}
        {...props}
      />
      {erro ? <Text style={estilos.erro}>{erro}</Text> : null}
    </View>
  );
}

const estilos = StyleSheet.create({
  grupo: { gap: 6 },
  rotulo: { fontSize: 13, fontWeight: '600', color: cores.texto },
  entrada: {
    minHeight: 52,
    borderWidth: 1,
    borderColor: cores.borda,
    borderRadius: 10,
    paddingHorizontal: 14,
    fontSize: 16,
    color: cores.texto,
    backgroundColor: cores.cartao,
  },
  entradaComErro: { borderColor: cores.erro },
  erro: { fontSize: 13, color: cores.erro },
});
