import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { abrirBancoLocal } from '@/db/cliente';
import { useSessaoStore } from '@/stores/sessaoStore';
import { cores } from '@/theme/cores';

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
  const [banco, setBanco] = useState<{ pronto: boolean; erro?: Error }>({ pronto: false });

  // Abre o banco local e aplica as migrações (em paralelo com a restauração da sessão)
  useEffect(() => {
    abrirBancoLocal().then(
      () => setBanco({ pronto: true }),
      (erro: unknown) =>
        setBanco({ pronto: false, erro: erro instanceof Error ? erro : new Error(String(erro)) }),
    );
  }, []);

  useEffect(() => {
    void useSessaoStore.getState().restaurar();
  }, []);

  const pronto = situacao !== 'iniciando' && (banco.pronto || banco.erro !== undefined);
  useEffect(() => {
    if (pronto) SplashScreen.hide();
  }, [pronto]);

  if (banco.erro) {
    // Raro (ex.: aparelho sem espaço). Sem banco local o app não funciona offline.
    return (
      <View style={estilos.erro}>
        <Text style={estilos.tituloErro}>Não foi possível preparar o banco do aparelho</Text>
        <Text style={estilos.textoErro}>{banco.erro.message}</Text>
        {/* O Drizzle guarda o erro original do SQLite em "cause" */}
        {banco.erro.cause instanceof Error ? (
          <Text style={estilos.textoErro}>{banco.erro.cause.message}</Text>
        ) : null}
      </View>
    );
  }
  if (!pronto) return null;

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

const estilos = StyleSheet.create({
  erro: { flex: 1, justifyContent: 'center', padding: 24, gap: 12, backgroundColor: cores.fundo },
  tituloErro: { fontSize: 18, fontWeight: '700', color: cores.erro },
  textoErro: { fontSize: 14, color: cores.texto },
});
