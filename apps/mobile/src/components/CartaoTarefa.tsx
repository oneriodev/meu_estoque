import {
  ehUrgente,
  NOMES_STATUS,
  NOMES_TIPOS,
  STATUS_ABERTOS,
  formatarDataHora,
} from '@meu-estoque/shared';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { estaAtrasada, type TarefaLocal } from '@/db/repositorios/tarefaRepositorio';
import { cores } from '@/theme/cores';

interface CartaoTarefaProps {
  tarefa: TarefaLocal;
  onPress: () => void;
  /** Mostra quem está com a tarefa (útil na visão da loja) */
  mostrarResponsavel?: boolean;
}

/** Cor do selo de status: o operador reconhece a situação pela cor antes de ler. */
const COR_STATUS: Record<TarefaLocal['status'], { fundo: string; texto: string }> = {
  GERADA: { fundo: cores.destaque, texto: cores.textoSobreDestaque },
  ACEITA: { fundo: '#DCE9F7', texto: '#1B4A7A' },
  EM_EXECUCAO: { fundo: '#DCE9F7', texto: '#1B4A7A' },
  CONCLUIDA: { fundo: cores.fundoSucesso, texto: cores.sucesso },
  IMPEDIDA: { fundo: cores.fundoErro, texto: cores.erro },
  CANCELADA: { fundo: cores.borda, texto: cores.textoSuave },
  OBSOLETA: { fundo: cores.borda, texto: cores.textoSuave },
};

/** Item da lista de tarefas: tipo, título, produto, situação e avisos (atrasada, não enviada). */
export function CartaoTarefa({ tarefa, onPress, mostrarResponsavel = false }: CartaoTarefaProps) {
  const atrasada = estaAtrasada(tarefa);
  const cor = COR_STATUS[tarefa.status];
  const aberta = STATUS_ABERTOS.includes(tarefa.status);

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        estilos.cartao,
        atrasada && estilos.atrasada,
        !aberta && estilos.encerrada,
        pressed && estilos.pressionado,
      ]}
    >
      <View style={estilos.linha}>
        <Text style={estilos.tipo}>
          {NOMES_TIPOS[tarefa.tipo]}
          {ehUrgente(tarefa) ? '  ·  urgente' : ''}
        </Text>
        <Text style={[estilos.selo, { backgroundColor: cor.fundo, color: cor.texto }]}>
          {NOMES_STATUS[tarefa.status]}
        </Text>
      </View>

      <Text style={estilos.titulo} numberOfLines={2}>
        {tarefa.titulo}
      </Text>
      {tarefa.produtoDescricao ? (
        <Text style={estilos.detalhe} numberOfLines={1}>
          {tarefa.produtoDescricao}
        </Text>
      ) : null}

      <View style={estilos.linha}>
        <Text style={[estilos.detalhe, atrasada && estilos.textoAtrasada]}>
          {tarefa.prazo
            ? `${atrasada ? 'Atrasada · ' : ''}prazo ${formatarDataHora(tarefa.prazo)}`
            : ''}
          {mostrarResponsavel
            ? `${tarefa.prazo ? '  ·  ' : ''}${tarefa.responsavelNome ?? 'sem responsável'}`
            : ''}
        </Text>
        {/* Transparência do offline: a pessoa sabe que a ação ainda não chegou ao servidor */}
        {tarefa.pendente ? <Text style={estilos.pendente}>não enviada</Text> : null}
      </View>
    </Pressable>
  );
}

const estilos = StyleSheet.create({
  cartao: {
    backgroundColor: cores.cartao,
    borderColor: cores.borda,
    borderWidth: 1,
    borderRadius: 10,
    padding: 14,
    gap: 4,
  },
  atrasada: { borderColor: cores.erro, borderLeftWidth: 5 },
  encerrada: { opacity: 0.65 },
  pressionado: { opacity: 0.85 },
  linha: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  tipo: { fontSize: 11, letterSpacing: 0.6, textTransform: 'uppercase', color: cores.textoSuave },
  selo: {
    fontSize: 12,
    fontWeight: '700',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
    overflow: 'hidden',
  },
  titulo: { fontSize: 16, fontWeight: '700', color: cores.texto },
  detalhe: { fontSize: 13, color: cores.textoSuave, flexShrink: 1 },
  textoAtrasada: { color: cores.erro, fontWeight: '700' },
  pendente: { fontSize: 12, color: '#8A5A00', fontWeight: '700' },
});
