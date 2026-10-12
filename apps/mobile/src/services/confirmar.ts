import { Alert, Platform } from 'react-native';

/**
 * Pergunta "sim ou não" ao usuário e devolve a resposta como Promise.
 * Na web, o Alert do React Native não mostra botões, então usamos o confirm do navegador.
 */
export function confirmar(
  titulo: string,
  mensagem: string,
  textoConfirmar = 'Confirmar',
): Promise<boolean> {
  if (Platform.OS === 'web') {
    return Promise.resolve(window.confirm(`${titulo}\n\n${mensagem}`));
  }
  return new Promise((resolve) => {
    Alert.alert(titulo, mensagem, [
      { text: 'Cancelar', style: 'cancel', onPress: () => resolve(false) },
      { text: textoConfirmar, style: 'destructive', onPress: () => resolve(true) },
    ]);
  });
}
