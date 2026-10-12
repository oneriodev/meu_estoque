import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Recusa } from '@/db/repositorios/tarefaRepositorio';
import { descartarRecusa } from '@/services/tarefasService';
import { cores } from '@/theme/cores';

interface AvisoRecusaProps {
  recusa: Recusa;
  /** Título da tarefa, quando conhecido (a lista mostra; a tela da tarefa não precisa) */
  tituloTarefa?: string | undefined;
}

/**
 * Aviso de ação recusada pelo servidor (ex.: um colega aceitou a tarefa primeiro).
 * A tela já voltou a mostrar o que o servidor sabe; o aviso explica POR QUÊ.
 * Fica até a pessoa tocar em "Entendi": um conflito não pode passar despercebido.
 */
export function AvisoRecusa({ recusa, tituloTarefa }: AvisoRecusaProps) {
  return (
    <View style={estilos.aviso} accessibilityRole="alert">
      <Text style={estilos.texto}>
        <Text style={estilos.forte}>Não foi possível {recusa.acao.toLowerCase()}</Text>
        {tituloTarefa ? ` "${tituloTarefa}"` : ''}: {recusa.motivo}
      </Text>
      <Pressable
        accessibilityRole="button"
        onPress={() => descartarRecusa(recusa.eventoId)}
        style={estilos.botao}
      >
        <Text style={estilos.textoBotao}>Entendi</Text>
      </Pressable>
    </View>
  );
}

const estilos = StyleSheet.create({
  aviso: {
    backgroundColor: cores.fundoErro,
    borderRadius: 10,
    padding: 12,
    gap: 8,
  },
  texto: { color: cores.erro, fontSize: 14 },
  forte: { fontWeight: '700' },
  botao: { alignSelf: 'flex-end', paddingVertical: 6, paddingHorizontal: 12 },
  textoBotao: { color: cores.erro, fontWeight: '700', fontSize: 15 },
});
