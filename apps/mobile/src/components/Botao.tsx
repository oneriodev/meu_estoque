import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';
import { cores } from '@/theme/cores';

type Variante = 'primario' | 'secundario' | 'perigo';

/** Props: os "parâmetros" que quem usa o componente passa para ele. */
interface BotaoProps {
  titulo: string;
  onPress: () => void;
  variante?: Variante;
  carregando?: boolean;
  desabilitado?: boolean;
}

/** Botão padrão do app: área de toque grande (fácil de acertar com luva ou pressa). */
export function Botao({
  titulo,
  onPress,
  variante = 'primario',
  carregando = false,
  desabilitado = false,
}: BotaoProps) {
  const inativo = carregando || desabilitado;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: inativo, busy: carregando }}
      disabled={inativo}
      onPress={onPress}
      style={({ pressed }) => [
        estilos.base,
        estilos[variante],
        pressed && estilos.pressionado,
        inativo && estilos.inativo,
      ]}
    >
      {carregando ? (
        <ActivityIndicator
          color={variante === 'primario' ? cores.textoSobreDestaque : cores.texto}
        />
      ) : (
        <Text style={[estilos.texto, variante === 'perigo' && estilos.textoPerigo]}>{titulo}</Text>
      )}
    </Pressable>
  );
}

const estilos = StyleSheet.create({
  base: {
    minHeight: 52,
    borderRadius: 10,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primario: { backgroundColor: cores.destaque },
  secundario: { backgroundColor: cores.cartao, borderWidth: 1, borderColor: cores.borda },
  perigo: { backgroundColor: cores.cartao, borderWidth: 1, borderColor: cores.fundoErro },
  pressionado: { opacity: 0.85 },
  inativo: { opacity: 0.5 },
  texto: { fontSize: 16, fontWeight: '700', color: cores.texto },
  textoPerigo: { color: cores.erro },
});
