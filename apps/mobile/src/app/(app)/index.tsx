import { lojaResumoSchema } from '@meu-estoque/shared';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Botao } from '@/components/Botao';
import { api, ErroApi } from '@/services/api';
import { ehGestor, nomeDoPapel } from '@/services/permissoes';
import { useSessaoStore } from '@/stores/sessaoStore';
import { cores } from '@/theme/cores';

/** Tela inicial. As tarefas chegam na Etapa 8; por enquanto, sessão e testes da API. */
export default function TelaInicio() {
  const router = useRouter();
  const usuario = useSessaoStore((s) => s.usuario);
  const loja = useSessaoStore((s) => s.loja);
  const trocarLoja = useSessaoStore((s) => s.trocarLoja);
  const sair = useSessaoStore((s) => s.sair);

  const [testeApi, setTesteApi] = useState<string | null>(null);
  const [testando, setTestando] = useState(false);
  const [saindo, setSaindo] = useState(false);

  if (!usuario || !loja) return null; // o _layout raiz não deixa chegar aqui sem os dois

  /** Rota protegida por token E por escopo de loja (EscopoLojaGuard na API). */
  async function testarRotaProtegida(): Promise<void> {
    if (!loja) return;
    setTestando(true);
    try {
      const dados = await api(`/lojas/${loja.id}`, { schema: lojaResumoSchema });
      setTesteApi(`OK: a API confirmou acesso à loja ${dados.codigo}.`);
    } catch (erro) {
      setTesteApi(erro instanceof ErroApi ? `Erro ${erro.status}: ${erro.message}` : 'Erro');
    } finally {
      setTestando(false);
    }
  }

  async function confirmarSaida(): Promise<void> {
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
        <Text style={estilos.rotulo}>Minhas tarefas</Text>
        <Text style={estilos.texto}>O motor de tarefas chega na Etapa 8.</Text>
      </View>

      {ehGestor(usuario.papel) ? (
        <Botao titulo="Fila da loja" onPress={() => router.push('/fila')} />
      ) : null}

      <View style={estilos.cartao}>
        <Text style={estilos.rotulo}>Teste da API</Text>
        <Botao
          titulo="Testar rota protegida"
          variante="secundario"
          carregando={testando}
          onPress={() => void testarRotaProtegida()}
        />
        {testeApi ? <Text style={estilos.texto}>{testeApi}</Text> : null}
      </View>

      <Botao
        titulo="Sair"
        variante="perigo"
        carregando={saindo}
        onPress={() => void confirmarSaida()}
      />
    </ScrollView>
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
