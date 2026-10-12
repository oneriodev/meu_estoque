import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Botao } from '@/components/Botao';
import { useSincronizacaoStore } from '@/stores/sincronizacaoStore';
import { cores } from '@/theme/cores';

/** "21:45" a partir de um horário ISO. */
function horario(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

/**
 * Mostra ao operador se os dados do aparelho estão em dia e se há ações esperando envio.
 * Transparência é importante no offline-first: a pessoa precisa saber que pode confiar no que vê.
 */
export function CartaoSincronizacao() {
  const situacao = useSincronizacaoStore((s) => s.situacao);
  const recebidos = useSincronizacaoStore((s) => s.recebidos);
  const mensagemErro = useSincronizacaoStore((s) => s.mensagemErro);
  const ultima = useSincronizacaoStore((s) => s.ultimaSincronizacao);
  const pendentes = useSincronizacaoStore((s) => s.pendentes);
  const rejeitados = useSincronizacaoStore((s) => s.rejeitados);
  const copia = useSincronizacaoStore((s) => s.copiaLocal);
  const sincronizar = useSincronizacaoStore((s) => s.sincronizar);
  const registrarEvento = useSincronizacaoStore((s) => s.registrarEvento);

  const primeiraCarga = copia.produtos === 0 && situacao === 'sincronizando';

  return (
    <View style={estilos.cartao}>
      <Text style={estilos.rotulo}>Sincronização</Text>

      <View style={estilos.linhaStatus}>
        {situacao === 'sincronizando' ? <ActivityIndicator color={cores.texto} /> : null}
        <Text style={[estilos.status, situacao === 'erro' && estilos.statusErro]}>
          {situacao === 'sincronizando' &&
            (primeiraCarga
              ? `Preparando a loja… ${recebidos} registros`
              : `Sincronizando… ${recebidos} registros`)}
          {situacao === 'parado' && `Em dia · sincronizado às ${horario(ultima)}`}
          {situacao === 'offline' && `Sem conexão · dados de ${horario(ultima)}`}
          {situacao === 'erro' && `Erro: ${mensagemErro ?? 'desconhecido'}`}
        </Text>
      </View>

      <Text style={estilos.texto}>
        No aparelho: {copia.produtos} produtos · {copia.eans} códigos · {copia.lotes} lotes
      </Text>
      <Text style={[estilos.texto, pendentes > 0 && estilos.destaque]}>
        Aguardando envio: {pendentes}
        {rejeitados > 0 ? `  ·  Rejeitados: ${rejeitados}` : ''}
      </Text>

      <Botao
        titulo="Sincronizar agora"
        variante="secundario"
        carregando={situacao === 'sincronizando'}
        onPress={() => void sincronizar({ forcar: true })}
      />
      {/* Só em desenvolvimento: gera um evento de teste para ver a fila funcionando (inclusive offline) */}
      {__DEV__ ? (
        <Botao
          titulo="Gerar evento de teste"
          variante="secundario"
          onPress={() =>
            registrarEvento('DIAGNOSTICO', {
              mensagem: `Teste às ${new Date().toLocaleTimeString('pt-BR')}`,
            })
          }
        />
      ) : null}
    </View>
  );
}

const estilos = StyleSheet.create({
  cartao: {
    backgroundColor: cores.cartao,
    borderColor: cores.borda,
    borderWidth: 1,
    borderRadius: 10,
    padding: 14,
    gap: 8,
  },
  rotulo: { fontSize: 11, letterSpacing: 0.6, textTransform: 'uppercase', color: cores.textoSuave },
  linhaStatus: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  status: { fontSize: 15, fontWeight: '600', color: cores.texto, flexShrink: 1 },
  statusErro: { color: cores.erro },
  texto: { fontSize: 14, color: cores.texto },
  destaque: { fontWeight: '700' },
});
