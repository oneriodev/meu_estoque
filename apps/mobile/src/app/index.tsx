import { gtinSchema } from '@meu-estoque/shared';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { API_URL } from '@/services/config';
import { cores } from '@/theme/cores';

type StatusApi =
  | { situacao: 'carregando' }
  | { situacao: 'ok'; banco: string }
  | { situacao: 'erro'; mensagem: string };

/** EAN fictício (prefixo 04 = uso interno GS1), validado com o MESMO schema que a API usa. */
const CODIGO_EXEMPLO = '0400000000015';

/**
 * Primeira tela: confere se o app alcança a API e se o pacote shared funciona.
 * Na Etapa 5B ela dá lugar à tela de login.
 */
export default function TelaInicial() {
  const [status, setStatus] = useState<StatusApi>({ situacao: 'carregando' });

  async function verificarApi(): Promise<void> {
    setStatus({ situacao: 'carregando' });
    try {
      const resposta = await fetch(`${API_URL}/health`);
      const corpo = (await resposta.json()) as { banco?: string; message?: string };
      if (!resposta.ok) throw new Error(corpo.message ?? `HTTP ${resposta.status}`);
      setStatus({ situacao: 'ok', banco: corpo.banco ?? '?' });
    } catch (erro) {
      setStatus({
        situacao: 'erro',
        mensagem: erro instanceof Error ? erro.message : 'Erro desconhecido',
      });
    }
  }

  // Roda uma vez, quando a tela aparece
  useEffect(() => {
    void verificarApi();
  }, []);

  const codigoValido = gtinSchema.safeParse(CODIGO_EXEMPLO).success;

  return (
    <SafeAreaView style={estilos.tela}>
      <View style={estilos.marca}>
        <View style={estilos.etiqueta} />
        <Text style={estilos.titulo}>Meu Estoque</Text>
      </View>
      <Text style={estilos.subtitulo}>Operações de loja</Text>

      <View style={estilos.cartao}>
        <Text style={estilos.rotulo}>API</Text>
        <Text style={estilos.endereco}>{API_URL}</Text>
        {status.situacao === 'carregando' && <ActivityIndicator color={cores.texto} />}
        {status.situacao === 'ok' && (
          <Text style={[estilos.selo, estilos.seloOk]}>No ar · banco {status.banco}</Text>
        )}
        {status.situacao === 'erro' && (
          <Text style={[estilos.selo, estilos.seloErro]}>Sem conexão: {status.mensagem}</Text>
        )}
      </View>

      <View style={estilos.cartao}>
        <Text style={estilos.rotulo}>Pacote shared</Text>
        <Text style={estilos.endereco}>
          EAN {CODIGO_EXEMPLO}: {codigoValido ? 'dígito verificador válido' : 'inválido'}
        </Text>
      </View>

      <Pressable
        style={({ pressed }) => [estilos.botao, pressed && estilos.botaoPressionado]}
        onPress={() => void verificarApi()}
      >
        <Text style={estilos.textoBotao}>Verificar de novo</Text>
      </Pressable>
    </SafeAreaView>
  );
}

const estilos = StyleSheet.create({
  tela: { flex: 1, backgroundColor: cores.fundo, padding: 20, gap: 14 },
  marca: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 24 },
  etiqueta: { width: 34, height: 26, borderRadius: 3, backgroundColor: cores.destaque },
  titulo: { fontSize: 26, fontWeight: '800', color: cores.texto },
  subtitulo: { fontSize: 14, color: cores.textoSuave, marginBottom: 8 },
  cartao: {
    backgroundColor: cores.cartao,
    borderColor: cores.borda,
    borderWidth: 1,
    borderRadius: 10,
    padding: 14,
    gap: 6,
  },
  rotulo: { fontSize: 11, letterSpacing: 0.6, textTransform: 'uppercase', color: cores.textoSuave },
  endereco: { fontSize: 13, color: cores.texto },
  selo: { alignSelf: 'flex-start', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 },
  seloOk: { backgroundColor: cores.fundoSucesso, color: cores.sucesso },
  seloErro: { backgroundColor: cores.fundoErro, color: cores.erro },
  botao: {
    marginTop: 'auto',
    backgroundColor: cores.texto,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  botaoPressionado: { opacity: 0.8 },
  textoBotao: { color: '#FFFFFF', fontSize: 15, fontWeight: '600' },
});