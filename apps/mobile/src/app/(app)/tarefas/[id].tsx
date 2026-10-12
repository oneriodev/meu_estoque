import {
  acoesPermitidas,
  ehUrgente,
  formatarData,
  formatarDataHora,
  NOMES_ACOES,
  NOMES_STATUS,
  NOMES_TIPOS,
  papelUsuarioSchema,
  REGRAS_ACOES,
  tarefaDetalheSchema,
  tarefaResumoSchema,
  type AcaoTarefa,
  type TarefaDetalhe,
} from '@meu-estoque/shared';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { z } from 'zod';
import { AvisoRecusa } from '@/components/AvisoRecusa';
import { Botao } from '@/components/Botao';
import { CampoTexto } from '@/components/CampoTexto';
import { detalharProduto } from '@/db/repositorios/produtoRepositorio';
import { estaAtrasada, gravarTarefa } from '@/db/repositorios/tarefaRepositorio';
import { useTarefas } from '@/hooks/useTarefas';
import { api, ErroApi } from '@/services/api';
import { confirmar } from '@/services/confirmar';
import { ehGestor } from '@/services/permissoes';
import { agirNaTarefa } from '@/services/tarefasService';
import { useSessaoStore } from '@/stores/sessaoStore';
import { useSincronizacaoStore } from '@/stores/sincronizacaoStore';
import { cores } from '@/theme/cores';

const equipeSchema = z.array(
  z.object({ id: z.uuid(), nome: z.string(), papel: papelUsuarioSchema }),
);
type Equipe = z.infer<typeof equipeSchema>;

/** Ações "positivas" ganham o botão principal; as demais ficam como secundárias. */
const ACOES_PRINCIPAIS: AcaoTarefa[] = ['ACEITAR', 'INICIAR', 'CONCLUIR', 'REABRIR'];

/** Pergunta antes das ações que encerram a tarefa (um toque sem querer não pode concluir). */
const PEDE_CONFIRMACAO: Partial<Record<AcaoTarefa, string>> = {
  CONCLUIR: 'Confirma que a tarefa foi feita?',
  DEVOLVER: 'A tarefa volta para a fila e outra pessoa poderá pegá-la.',
};

/**
 * Detalhe da tarefa. A parte principal (dados e botões) vem do aparelho e funciona offline;
 * o histórico e a redistribuição precisam de internet (são consultas online à API).
 */
export default function TelaTarefa() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const usuario = useSessaoStore((s) => s.usuario);
  const loja = useSessaoStore((s) => s.loja);
  const sincronizar = useSincronizacaoStore((s) => s.sincronizar);
  const { tarefas, recusas } = useTarefas();

  const tarefa = tarefas.find((t) => t.id === id);
  const produto = useMemo(
    () => (tarefa?.produtoId ? detalharProduto(tarefa.produtoId) : null),
    [tarefa?.produtoId],
  );

  // Ação que pede motivo (cancelar, impedimento): o campo aparece antes de confirmar
  const [acaoComMotivo, setAcaoComMotivo] = useState<AcaoTarefa | null>(null);
  const [motivo, setMotivo] = useState('');
  const [erroMotivo, setErroMotivo] = useState<string | undefined>();

  if (!tarefa || !usuario || !loja) {
    return (
      <View style={estilos.conteudo}>
        <Text style={estilos.texto}>Tarefa não encontrada no aparelho.</Text>
      </View>
    );
  }

  const acoes = acoesPermitidas(tarefa, usuario);
  const gestor = ehGestor(usuario.papel);
  const atrasada = estaAtrasada(tarefa);

  async function executar(acao: AcaoTarefa): Promise<void> {
    if (!tarefa) return;
    if (REGRAS_ACOES[acao].exigeMotivo) {
      setAcaoComMotivo(acao);
      setMotivo('');
      setErroMotivo(undefined);
      return;
    }
    const pergunta = PEDE_CONFIRMACAO[acao];
    if (pergunta && !(await confirmar(NOMES_ACOES[acao], pergunta, NOMES_ACOES[acao]))) return;
    agirNaTarefa(tarefa.id, acao);
  }

  function confirmarComMotivo(): void {
    if (!tarefa || !acaoComMotivo) return;
    // Mesma regra do schema compartilhado (mín. 3 letras), validada aqui para mostrar no campo
    if (motivo.trim().length < 3) {
      setErroMotivo('Explique em poucas palavras o motivo');
      return;
    }
    agirNaTarefa(tarefa.id, acaoComMotivo, motivo.trim());
    setAcaoComMotivo(null);
  }

  return (
    <ScrollView contentContainerStyle={estilos.conteudo} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: NOMES_TIPOS[tarefa.tipo] }} />

      {recusas
        .filter((r) => r.tarefaId === tarefa.id)
        .map((recusa) => (
          <AvisoRecusa key={recusa.eventoId} recusa={recusa} />
        ))}

      <View style={estilos.cartao}>
        <Text style={estilos.rotulo}>
          {NOMES_TIPOS[tarefa.tipo]} ·{' '}
          {tarefa.origem === 'AUTOMATICA' ? 'gerada pelo sistema' : 'criada pela equipe'}
          {ehUrgente(tarefa) ? ' · urgente' : ''}
        </Text>
        <Text style={estilos.titulo}>{tarefa.titulo}</Text>
        {tarefa.descricao ? <Text style={estilos.texto}>{tarefa.descricao}</Text> : null}
        <Text style={estilos.status}>
          {NOMES_STATUS[tarefa.status]}
          {tarefa.responsavelNome ? ` · com ${tarefa.responsavelNome}` : ' · sem responsável'}
        </Text>
        {tarefa.prazo ? (
          <Text style={[estilos.texto, atrasada && estilos.textoErro]}>
            {atrasada ? 'Atrasada · ' : ''}Prazo: {formatarDataHora(tarefa.prazo)}
          </Text>
        ) : null}
        {tarefa.pendente ? (
          <Text style={estilos.pendente}>
            Ação registrada no aparelho, será enviada quando houver conexão.
          </Text>
        ) : null}
      </View>

      {produto ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push({ pathname: '/produto/[id]', params: { id: produto.id } })}
          style={({ pressed }) => [estilos.cartao, pressed && estilos.pressionado]}
        >
          <Text style={estilos.rotulo}>Produto</Text>
          <Text style={estilos.subtitulo}>{produto.descricao}</Text>
          <Text style={estilos.texto}>
            Cód. {produto.codigoErp} · Endereço: {produto.endereco ?? 'não informado'}
          </Text>
          {produto.lotes[0] ? (
            <Text style={estilos.texto}>
              Lote mais próximo do vencimento: {formatarData(produto.lotes[0].validade)}
            </Text>
          ) : null}
          <Text style={estilos.link}>Ver produto ›</Text>
        </Pressable>
      ) : null}

      {acaoComMotivo ? (
        <View style={estilos.cartao}>
          <CampoTexto
            rotulo={`Motivo (${NOMES_ACOES[acaoComMotivo].toLowerCase()})`}
            placeholder={
              acaoComMotivo === 'IMPEDIR'
                ? 'Ex.: produto não está no depósito'
                : 'Ex.: tarefa repetida'
            }
            value={motivo}
            onChangeText={setMotivo}
            erro={erroMotivo}
            autoFocus
            maxLength={500}
          />
          <Botao titulo={`Confirmar: ${NOMES_ACOES[acaoComMotivo]}`} onPress={confirmarComMotivo} />
          <Botao titulo="Voltar" variante="secundario" onPress={() => setAcaoComMotivo(null)} />
        </View>
      ) : (
        <View style={estilos.acoes}>
          {acoes.map((acao) => (
            <Botao
              key={acao}
              titulo={NOMES_ACOES[acao]}
              variante={
                ACOES_PRINCIPAIS.includes(acao)
                  ? 'primario'
                  : acao === 'CANCELAR'
                    ? 'perigo'
                    : 'secundario'
              }
              onPress={() => void executar(acao)}
            />
          ))}
          {acoes.length === 0 ? (
            <Text style={estilos.detalhe}>Nenhuma ação disponível para você nesta tarefa.</Text>
          ) : null}
        </View>
      )}

      {gestor && !tarefa.pendente ? (
        <Atribuicao
          lojaId={loja.id}
          tarefaId={tarefa.id}
          responsavelId={tarefa.responsavelId}
          aoAtribuir={() => void sincronizar()}
        />
      ) : null}

      {/* Tarefa criada offline ainda não existe no servidor: não há histórico para buscar */}
      {!tarefa.pendente ? (
        <Historico lojaId={loja.id} tarefaId={tarefa.id} versao={tarefa.atualizadoEm} />
      ) : null}
    </ScrollView>
  );
}

// ─── Redistribuição (gestor, online) ──────────────────────────────────────────

interface AtribuicaoProps {
  lojaId: string;
  tarefaId: string;
  responsavelId: string | null;
  aoAtribuir: () => void;
}

/**
 * O gestor escolhe quem fica com a tarefa. É uma rota REST (online) e não um evento
 * da outbox: redistribuir depende da situação ATUAL da equipe, então só faz sentido
 * com o servidor respondendo na hora.
 */
function Atribuicao({ lojaId, tarefaId, responsavelId, aoAtribuir }: AtribuicaoProps) {
  const [equipe, setEquipe] = useState<Equipe | null>(null);
  const [aberto, setAberto] = useState(false);
  const [salvando, setSalvando] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  async function abrir(): Promise<void> {
    setAberto(true);
    setErro(null);
    if (equipe) return;
    try {
      setEquipe(await api(`/lojas/${lojaId}/equipe`, { schema: equipeSchema }));
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : 'Erro ao carregar a equipe');
    }
  }

  async function atribuir(novoResponsavel: string | null): Promise<void> {
    setSalvando(novoResponsavel ?? 'fila');
    setErro(null);
    try {
      const atualizada = await api(`/lojas/${lojaId}/tarefas/${tarefaId}/atribuir`, {
        metodo: 'POST',
        corpo: { responsavelId: novoResponsavel },
        schema: tarefaResumoSchema,
      });
      gravarTarefa(atualizada); // a tela muda na hora, sem esperar o próximo pull
      setAberto(false);
      aoAtribuir();
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : 'Erro ao redistribuir');
    } finally {
      setSalvando(null);
    }
  }

  if (!aberto) {
    return <Botao titulo="Atribuir a..." variante="secundario" onPress={() => void abrir()} />;
  }

  return (
    <View style={estilos.cartao}>
      <Text style={estilos.rotulo}>Atribuir a</Text>
      {erro ? <Text style={estilos.textoErro}>{erro}</Text> : null}
      {equipe === null && !erro ? (
        <Text style={estilos.detalhe}>Carregando a equipe...</Text>
      ) : null}
      {equipe?.map((membro) => (
        <Botao
          key={membro.id}
          titulo={membro.id === responsavelId ? `${membro.nome} (atual)` : membro.nome}
          variante="secundario"
          desabilitado={membro.id === responsavelId}
          carregando={salvando === membro.id}
          onPress={() => void atribuir(membro.id)}
        />
      ))}
      {responsavelId ? (
        <Botao
          titulo="Devolver para a fila"
          variante="secundario"
          carregando={salvando === 'fila'}
          onPress={() => void atribuir(null)}
        />
      ) : null}
      <Botao titulo="Fechar" variante="secundario" onPress={() => setAberto(false)} />
    </View>
  );
}

// ─── Histórico (online) ───────────────────────────────────────────────────────

interface HistoricoProps {
  lojaId: string;
  tarefaId: string;
  /** Muda quando a tarefa muda: recarrega o histórico */
  versao: string;
}

/** Quem fez o quê e quando: os eventos imutáveis gravados pelo servidor (auditoria). */
function Historico({ lojaId, tarefaId, versao }: HistoricoProps) {
  const [detalhe, setDetalhe] = useState<TarefaDetalhe | null>(null);
  const [indisponivel, setIndisponivel] = useState(false);

  useEffect(() => {
    let ativo = true; // evita atualizar a tela se a pessoa já saiu dela
    api(`/lojas/${lojaId}/tarefas/${tarefaId}`, { schema: tarefaDetalheSchema })
      .then((resposta) => {
        if (ativo) {
          setDetalhe(resposta);
          setIndisponivel(false);
        }
      })
      .catch(() => {
        if (ativo) setIndisponivel(true);
      });
    return () => {
      ativo = false;
    };
  }, [lojaId, tarefaId, versao]);

  return (
    <View style={estilos.cartao}>
      <Text style={estilos.rotulo}>Histórico</Text>
      {indisponivel && !detalhe ? (
        <Text style={estilos.detalhe}>O histórico aparece quando houver conexão.</Text>
      ) : null}
      {detalhe?.eventos.map((evento) => (
        <View key={evento.id} style={estilos.evento}>
          <Text style={estilos.texto}>
            {NOMES_STATUS[evento.statusNovo]}
            {evento.usuarioNome ? ` · ${evento.usuarioNome}` : ' · sistema'}
          </Text>
          <Text style={estilos.detalhe}>{formatarDataHora(evento.ocorridoEm)}</Text>
          {evento.motivo ? <Text style={estilos.detalhe}>Motivo: {evento.motivo}</Text> : null}
        </View>
      ))}
    </View>
  );
}

const estilos = StyleSheet.create({
  conteudo: { padding: 16, gap: 12 },
  cartao: {
    backgroundColor: cores.cartao,
    borderColor: cores.borda,
    borderWidth: 1,
    borderRadius: 10,
    padding: 14,
    gap: 6,
  },
  pressionado: { opacity: 0.85 },
  rotulo: { fontSize: 11, letterSpacing: 0.6, textTransform: 'uppercase', color: cores.textoSuave },
  titulo: { fontSize: 20, fontWeight: '800', color: cores.texto },
  subtitulo: { fontSize: 16, fontWeight: '700', color: cores.texto },
  status: { fontSize: 15, fontWeight: '700', color: cores.texto },
  texto: { fontSize: 15, color: cores.texto },
  detalhe: { fontSize: 13, color: cores.textoSuave },
  textoErro: { color: cores.erro, fontWeight: '700' },
  pendente: { fontSize: 13, color: '#8A5A00', fontWeight: '700' },
  link: { fontSize: 14, fontWeight: '700', color: cores.texto, alignSelf: 'flex-end' },
  acoes: { gap: 10 },
  evento: { borderTopWidth: 1, borderTopColor: cores.borda, paddingTop: 6, gap: 2 },
});
