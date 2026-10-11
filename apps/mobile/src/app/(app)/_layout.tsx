import { Stack } from 'expo-router';
import { ehGestor } from '@/services/permissoes';
import { useSessaoStore } from '@/stores/sessaoStore';
import { cores } from '@/theme/cores';

/**
 * Área logada (o grupo "(app)" não aparece na URL: os parênteses só agrupam rotas).
 * Rotas de gestão só existem para Supervisor e Administrador.
 */
export default function LayoutApp() {
  const gestor = useSessaoStore((s) => ehGestor(s.usuario?.papel));

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
      <Stack.Protected guard={gestor}>
        <Stack.Screen name="fila" options={{ title: 'Fila da loja' }} />
      </Stack.Protected>
    </Stack>
  );
}
