import { papelUsuarioSchema } from '@meu-estoque/shared';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from 'react-native';
import { z } from 'zod';
import { Botao } from '@/components/Botao';
import { api, ErroApi } from '@/services/api';
import { nomeDoPapel } from '@/services/permissoes';
import { useSessaoStore } from '@/stores/sessaoStore';
import { cores } from '@/theme/cores';

const equipeSchema = z.array(
  z.object({ id: z.uuid(), nome: z.string(), papel: papelUsuarioSchema }),
);
type Equipe = z.infer<typeof equipeSchema>;

type Estado =
  | { situacao: 'carregando' }
  | { situacao: 'ok'; equipe: Equipe }
  | { situacao: 'erro'; mensagem: string };

/**
 * Fila da loja (gestores). A fila de tarefas chega na Etapa 8; por enquanto
 * mostra a equipe, que vem de uma rota que a API libera só para gestores.
 */
export default function TelaFila() {
  const loja = useSessaoStore((s) => s.loja);
  const [estado, setEstado] = useState<Estado>({ situacao: 'carregando' });

  // useCallback mantém a mesma função entre renderizações (evita repetir o efeito à toa)
  const carregar = useCallback(async () => {
    if (!loja) return;
    setEstado({ situacao: 'carregando' });
    try {
      const equipe = await api(`/lojas/${loja.id}/equipe`, { schema: equipeSchema });
      setEstado({ situacao: 'ok', equipe });
    } catch (erro) {
      setEstado({
        situacao: 'erro',
        mensagem: erro instanceof ErroApi ? erro.message : 'Erro ao carregar a equipe',
      });
    }
  }, [loja]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  if (estado.situacao === 'carregando') {
    return <ActivityIndicator style={estilos.centro} color={cores.texto} />;
  }

  if (estado.situacao === 'erro') {
    return (
      <View style={estilos.conteudo}>
        <Text style={estilos.erro}>{estado.mensagem}</Text>
        <Botao titulo="Tentar de novo" variante="secundario" onPress={() => void carregar()} />
      </View>
    );
  }

  return (
    <FlatList
      data={estado.equipe}
      keyExtractor={(membro) => membro.id}
      contentContainerStyle={estilos.conteudo}
      ListHeaderComponent={<Text style={estilos.rotulo}>Equipe da loja {loja?.codigo}</Text>}
      renderItem={({ item }) => (
        <View style={estilos.item}>
          <Text style={estilos.nome}>{item.nome}</Text>
          <Text style={estilos.papel}>{nomeDoPapel[item.papel]}</Text>
        </View>
      )}
    />
  );
}

const estilos = StyleSheet.create({
  centro: { flex: 1 },
  conteudo: { padding: 16, gap: 10 },
  rotulo: { fontSize: 11, letterSpacing: 0.6, textTransform: 'uppercase', color: cores.textoSuave },
  item: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 14,
    borderRadius: 10,
    backgroundColor: cores.cartao,
    borderWidth: 1,
    borderColor: cores.borda,
  },
  nome: { fontSize: 16, color: cores.texto },
  papel: { fontSize: 13, color: cores.textoSuave },
  erro: { color: cores.erro, fontSize: 15 },
});
