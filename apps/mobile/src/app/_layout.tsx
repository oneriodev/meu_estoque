import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { useSessaoStore } from '@/stores/sessaoStore';

// Mantém a tela de abertura até sabermos se há sessão salva (evita "piscar" o login)
void SplashScreen.preventAutoHideAsync();

/**
 * Layout raiz: decide QUAIS telas existem conforme a sessão.
 *
 * Stack.Protected esconde as rotas cujo guard é false. Se o usuário estiver numa
 * rota que deixou de valer (ex.: fez logout), o Expo Router o leva para a
 * primeira rota permitida. Assim não há como "voltar" para a tela anterior ao login.
 */
export default function LayoutRaiz() {
  const situacao = useSessaoStore((s) => s.situacao);
  const temLoja = useSessaoStore((s) => s.loja !== null);

  useEffect(() => {
    void useSessaoStore.getState().restaurar();
  }, []);

  useEffect(() => {
    if (situacao !== 'iniciando') SplashScreen.hide();
  }, [situacao]);

  if (situacao === 'iniciando') return null;

  const logado = situacao === 'logado';

  return (
    <>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Protected guard={logado && temLoja}>
          <Stack.Screen name="(app)" />
        </Stack.Protected>
        <Stack.Protected guard={logado && !temLoja}>
          <Stack.Screen name="selecionar-loja" />
        </Stack.Protected>
        <Stack.Protected guard={!logado}>
          <Stack.Screen name="login" />
        </Stack.Protected>
      </Stack>
    </>
  );
}
