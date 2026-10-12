import { Stack } from 'expo-router';
import { useSincronizacaoAutomatica } from '@/hooks/useSincronizacaoAutomatica';
import { ehGestor } from '@/services/permissoes';
import { useSessaoStore } from '@/stores/sessaoStore';
import { cores } from '@/theme/cores';

/**
 * Área logada (o grupo "(app)" não aparece na URL: os parênteses só agrupam rotas).
 * Rotas de gestão só existem para Supervisor e Administrador.
 */
export default function LayoutApp() {
  const gestor = useSessaoStore((s) => ehGestor(s.usuario?.papel));
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
      <Stack.Screen name="leitor" options={{ title: 'Testar leitor' }} />
      <Stack.Protected guard={gestor}>
        <Stack.Screen name="fila" options={{ title: 'Fila da loja' }} />
      </Stack.Protected>
    </Stack>
  );
}
