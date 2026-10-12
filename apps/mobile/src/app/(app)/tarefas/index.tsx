import { STATUS_ABERTOS } from '@meu-estoque/shared';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { AvisoRecusa } from '@/components/AvisoRecusa';
import { Botao } from '@/components/Botao';
import { CartaoTarefa } from '@/components/CartaoTarefa';
import { estaAtrasada, type TarefaLocal } from '@/db/repositorios/tarefaRepositorio';
import { useTarefas } from '@/hooks/useTarefas';
import { ehGestor } from '@/services/permissoes';
import { useSessaoStore } from '@/stores/sessaoStore';
import { useSincronizacaoStore } from '@/stores/sincronizacaoStore';
import { cores } from '@/theme/cores';

type Aba = 'minhas' | 'disponiveis' | 'loja' | 'encerradas';

const NOMES_ABAS: Record<Aba, string> = {
  minhas: 'Minhas',
  disponiveis: 'Disponíveis',
  loja: 'Loja',
  encerradas: 'Encerradas',
};

/**
 * Cada aba é só um FILTRO sobre a mesma lista (que já vem ordenada por urgência).
 * - Minhas: abertas e assumidas por mim;
 * - Disponíveis: pendentes sem responsável (qualquer um pode aceitar);
 * - Loja (gestor): todas as abertas, com quem está com cada uma;
 * - Encerradas: concluídas, canceladas e impedidas dos últimos 7 dias.
 */
function filtrar(tarefas: TarefaLocal[], aba: Aba, usuarioId: string): TarefaLocal[] {
  return tarefas.filter((t) => {
    const aberta = STATUS_ABERTOS.includes(t.status);
    switch (aba) {
      case 'minhas':
        return aberta && t.responsavelId === usuarioId;
      case 'disponiveis':
        return t.status === 'GERADA' && t.responsavelId === null;
      case 'loja':
        return aberta;
      case 'encerradas':
        return !aberta;
    }
  });
}

/** Lista de tarefas. Funciona 100% offline: lê o banco do aparelho. */
export default function TelaTarefas() {
  const router = useRouter();
  const usuario = useSessaoStore((s) => s.usuario);
  const sincronizando = useSincronizacaoStore((s) => s.situacao === 'sincronizando');
  const sincronizar = useSincronizacaoStore((s) => s.sincronizar);
  const { tarefas, recusas } = useTarefas();
  const gestor = ehGestor(usuario?.papel);

  const [aba, setAba] = useState<Aba>('minhas');
  const abas: Aba[] = gestor
    ? ['minhas', 'disponiveis', 'loja', 'encerradas']
    : ['minhas', 'disponiveis', 'encerradas'];

  const titulos = useMemo(() => new Map(tarefas.map((t) => [t.id, t.titulo])), [tarefas]);
  if (!usuario) return null;
  const lista = filtrar(tarefas, aba, usuario.id);
  // Contar é barato (algumas dezenas de tarefas por loja): não precisa de useMemo
  const contagem = (a: Aba) => filtrar(tarefas, a, usuario.id).length;
  const atrasadas = tarefas.filter((t) => estaAtrasada(t)).length;

  return (
    <FlatList
      data={lista}
      keyExtractor={(t) => t.id}
      contentContainerStyle={estilos.conteudo}
      // Puxar para baixo = sincronizar agora (gesto que todo mundo conhece)
      refreshControl={
        <RefreshControl
          refreshing={sincronizando}
          onRefresh={() => void sincronizar({ forcar: true })}
        />
      }
      ListHeaderComponent={
        <View style={estilos.cabecalho}>
          {recusas.map((recusa) => (
            <AvisoRecusa
              key={recusa.eventoId}
              recusa={recusa}
              tituloTarefa={titulos.get(recusa.tarefaId)}
            />
          ))}

          {gestor && atrasadas > 0 ? (
            <Text style={estilos.alerta}>
              {atrasadas} tarefa{atrasadas === 1 ? '' : 's'} atrasada{atrasadas === 1 ? '' : 's'} na
              loja
            </Text>
          ) : null}

          <View style={estilos.abas} accessibilityRole="tablist">
            {abas.map((a) => (
              <Pressable
                key={a}
                accessibilityRole="tab"
                accessibilityState={{ selected: a === aba }}
                onPress={() => setAba(a)}
                style={[estilos.aba, a === aba && estilos.abaAtiva]}
              >
                <Text style={[estilos.textoAba, a === aba && estilos.textoAbaAtiva]}>
                  {NOMES_ABAS[a]}
                  {a !== 'encerradas' ? ` (${contagem(a)})` : ''}
                </Text>
              </Pressable>
            ))}
          </View>

          <Botao
            titulo="Nova tarefa"
            variante="secundario"
            onPress={() => router.push('/tarefas/nova')}
          />
        </View>
      }
      ListEmptyComponent={
        <Text style={estilos.vazio}>
          {aba === 'minhas'
            ? 'Nenhuma tarefa com você. Veja as disponíveis.'
            : aba === 'disponiveis'
              ? 'Nenhuma tarefa esperando alguém.'
              : 'Nada por aqui.'}
        </Text>
      }
      renderItem={({ item }) => (
        <CartaoTarefa
          tarefa={item}
          mostrarResponsavel={aba === 'loja' || aba === 'encerradas'}
          onPress={() => router.push({ pathname: '/tarefas/[id]', params: { id: item.id } })}
        />
      )}
    />
  );
}

const estilos = StyleSheet.create({
  conteudo: { padding: 16, gap: 10 },
  cabecalho: { gap: 10, marginBottom: 2 },
  alerta: {
    backgroundColor: cores.fundoErro,
    color: cores.erro,
    fontWeight: '700',
    borderRadius: 8,
    padding: 10,
  },
  abas: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  aba: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: cores.borda,
    backgroundColor: cores.cartao,
  },
  abaAtiva: { backgroundColor: cores.texto, borderColor: cores.texto },
  textoAba: { fontSize: 14, color: cores.texto, fontWeight: '600' },
  textoAbaAtiva: { color: cores.cartao },
  vazio: { textAlign: 'center', color: cores.textoSuave, marginTop: 24, fontSize: 15 },
});
