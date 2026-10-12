import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { STATUS_ABERTOS } from '@meu-estoque/shared';
import { Botao } from '@/components/Botao';
import { CartaoSincronizacao } from '@/components/CartaoSincronizacao';
import { estaAtrasada } from '@/db/repositorios/tarefaRepositorio';
import { useTarefas } from '@/hooks/useTarefas';
import { confirmar } from '@/services/confirmar';
import { ehGestor, nomeDoPapel } from '@/services/permissoes';
import { useSessaoStore } from '@/stores/sessaoStore';
import { useSincronizacaoStore } from '@/stores/sincronizacaoStore';
import { cores } from '@/theme/cores';

/** Tela inicial: quem sou, em que loja, resumo das tarefas e sincronização. */
export default function TelaInicio() {
  const router = useRouter();
  const usuario = useSessaoStore((s) => s.usuario);
  const loja = useSessaoStore((s) => s.loja);
  const trocarLoja = useSessaoStore((s) => s.trocarLoja);
  const sair = useSessaoStore((s) => s.sair);
  const pendentes = useSincronizacaoStore((s) => s.pendentes);
  const { tarefas, recusas } = useTarefas();

  const [saindo, setSaindo] = useState(false);

  if (!usuario || !loja) return null; // o _layout raiz não deixa chegar aqui sem os dois

  const abertas = tarefas.filter((t) => STATUS_ABERTOS.includes(t.status));
  const minhas = abertas.filter((t) => t.responsavelId === usuario.id).length;
  const disponiveis = abertas.filter((t) => t.status === 'GERADA' && !t.responsavelId).length;
  // Operador vê as próprias atrasadas; gestor vê as da loja inteira
  const atrasadas = abertas.filter(
    (t) => estaAtrasada(t) && (ehGestor(usuario.papel) || t.responsavelId === usuario.id),
  ).length;

  async function confirmarSaida(): Promise<void> {
    // Os eventos não enviados ficam guardados no aparelho e saem quando este usuário entrar de novo
    if (pendentes > 0) {
      const sairMesmo = await confirmar(
        'Há ações não enviadas',
        `${pendentes} ação(ões) ainda não chegaram ao servidor. Elas ficam guardadas neste aparelho ` +
          'e serão enviadas quando você entrar de novo. Sair mesmo assim?',
        'Sair',
      );
      if (!sairMesmo) return;
    }
    setSaindo(true);
    await sair();
  }

  return (
    <ScrollView contentContainerStyle={estilos.conteudo}>
      <View style={estilos.cartao}>
        <Text style={estilos.rotulo}>Você</Text>
        <Text style={estilos.nome}>{usuario.nome}</Text>
        <Text style={estilos.selo}>{nomeDoPapel[usuario.papel]}</Text>
      </View>

      <View style={estilos.cartao}>
        <Text style={estilos.rotulo}>Loja atual</Text>
        <Text style={estilos.nome}>
          {loja.codigo} · {loja.nome}
        </Text>
        {usuario.lojas.length > 1 ? (
          <Botao titulo="Trocar de loja" variante="secundario" onPress={() => void trocarLoja()} />
        ) : null}
      </View>

      <View style={estilos.cartao}>
        <Text style={estilos.rotulo}>Tarefas</Text>
        <View style={estilos.numeros}>
          <Numero valor={minhas} rotulo="comigo" />
          <Numero valor={disponiveis} rotulo="disponíveis" />
          <Numero valor={atrasadas} rotulo="atrasadas" alerta={atrasadas > 0} />
        </View>
        {recusas.length > 0 ? (
          <Text style={estilos.alerta}>
            {recusas.length} ação(ões) recusada(s) pelo servidor. Veja em Tarefas.
          </Text>
        ) : null}
        <Botao titulo="Ver tarefas" onPress={() => router.push('/tarefas')} />
      </View>

      <Botao titulo="Buscar produto" variante="secundario" onPress={() => router.push('/buscar')} />

      <CartaoSincronizacao />

      <Botao
        titulo="Sair"
        variante="perigo"
        carregando={saindo}
        onPress={() => void confirmarSaida()}
      />
    </ScrollView>
  );
}

/** Um número grande com legenda (lê-se de longe, com o aparelho na mão). */
function Numero({
  valor,
  rotulo,
  alerta = false,
}: {
  valor: number;
  rotulo: string;
  alerta?: boolean;
}) {
  return (
    <View style={estilos.numero}>
      <Text style={[estilos.valor, alerta && estilos.valorAlerta]}>{valor}</Text>
      <Text style={estilos.legenda}>{rotulo}</Text>
    </View>
  );
}

const estilos = StyleSheet.create({
  numeros: { flexDirection: 'row', justifyContent: 'space-around' },
  numero: { alignItems: 'center' },
  valor: { fontSize: 28, fontWeight: '800', color: cores.texto },
  valorAlerta: { color: cores.erro },
  legenda: { fontSize: 12, color: cores.textoSuave },
  alerta: { color: cores.erro, fontWeight: '700', fontSize: 14 },
  conteudo: { padding: 16, gap: 12 },
  cartao: {
    backgroundColor: cores.cartao,
    borderColor: cores.borda,
    borderWidth: 1,
    borderRadius: 10,
    padding: 14,
    gap: 8,
  },
  rotulo: { fontSize: 11, letterSpacing: 0.6, textTransform: 'uppercase', color: cores.textoSuave },
  nome: { fontSize: 18, fontWeight: '700', color: cores.texto },
  texto: { fontSize: 14, color: cores.texto },
  selo: {
    alignSelf: 'flex-start',
    backgroundColor: cores.destaque,
    color: cores.textoSobreDestaque,
    fontWeight: '700',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    overflow: 'hidden',
  },
});
