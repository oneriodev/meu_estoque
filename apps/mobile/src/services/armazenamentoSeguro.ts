import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

/**
 * Guarda pequenos textos sensíveis (como o refresh token) de forma segura.
 *
 * - Android: o expo-secure-store cifra o valor com uma chave do Android Keystore,
 *   que fica protegida pelo sistema e não sai do aparelho.
 * - Web (só para desenvolvimento): não existe um cofre equivalente no navegador,
 *   então o valor fica apenas na memória e some ao recarregar a página.
 *   Assim nunca deixamos um token em localStorage, onde qualquer script da página o leria.
 */
const memoriaWeb = new Map<string, string>();

export const armazenamentoSeguro = {
  async ler(chave: string): Promise<string | null> {
    if (Platform.OS === 'web') return memoriaWeb.get(chave) ?? null;
    return SecureStore.getItemAsync(chave);
  },

  async salvar(chave: string, valor: string): Promise<void> {
    if (Platform.OS === 'web') {
      memoriaWeb.set(chave, valor);
      return;
    }
    await SecureStore.setItemAsync(chave, valor);
  },

  async remover(chave: string): Promise<void> {
    if (Platform.OS === 'web') {
      memoriaWeb.delete(chave);
      return;
    }
    await SecureStore.deleteItemAsync(chave);
  },
};
