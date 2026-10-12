import { Stack } from 'expo-router';
import { useSincronizacaoAutomatica } from '@/hooks/useSincronizacaoAutomatica';
import { cores } from '@/theme/cores';

/**
 * Área logada (o grupo "(app)" não aparece na URL: os parênteses só agrupam rotas).
 * As telas de tarefas servem a todos os perfis: o que muda por perfil são as abas e os botões
 * (e quem decide de verdade o que cada um pode fazer é a API).
 */
export default function LayoutApp() {
  // Este layout só existe com usuário logado e loja escolhida: é aqui que a sincronização roda
  useSincronizacaoAutomatica();

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: cores.cartao },
        headerTintColor: cores.texto,
        headerTitleStyle: { fontWeight: '700' },
        contentStyle: { backgroundColor: cores.fundo },
      }}
    >
      <Stack.Screen name="index" options={{ title: 'Início' }} />
      <Stack.Screen name="buscar" options={{ title: 'Buscar produto' }} />
      <Stack.Screen name="produto/[id]" options={{ title: 'Produto' }} />
      <Stack.Screen name="tarefas/index" options={{ title: 'Tarefas' }} />
      <Stack.Screen name="tarefas/[id]" options={{ title: 'Tarefa' }} />
      <Stack.Screen name="tarefas/nova" options={{ title: 'Nova tarefa' }} />
    </Stack>
  );
}
