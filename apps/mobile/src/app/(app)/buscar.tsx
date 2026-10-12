import { formatarMoeda, formatarQuantidade, interpretarCodigo } from '@meu-estoque/shared';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type TextInput,
} from 'react-native';
import { Botao } from '@/components/Botao';
import { CampoTexto } from '@/components/CampoTexto';
import { LeitorCamera } from '@/components/LeitorCamera';
import {
  buscarPorLeitura,
  buscarPorTexto,
  type ProdutoResumo,
} from '@/db/repositorios/produtoRepositorio';
import { useSincronizacaoStore } from '@/stores/sincronizacaoStore';
import { cores } from '@/theme/cores';

/** Espera depois da última tecla antes de buscar (não consulta o banco a cada letra). */
const ESPERA_DIGITACAO_MS = 250;

/**
 * Busca de produto: por descrição, código interno, EAN digitado, coletor ou câmera.
 * Tudo no banco do aparelho: funciona sem internet, com os dados da última sincronização.
 */
export default function TelaBusca() {
  const router = useRouter();
  const [texto, setTexto] = useState('');
  const [resultados, setResultados] = useState<ProdutoResumo[]>([]);
  const [aviso, setAviso] = useState<string | null>(null);
  const [cameraAberta, setCameraAberta] = useState(false);
  const campo = useRef<TextInput>(null);
  // Quando uma sincronização termina, a busca é refeita com os dados novos
  const ultimaSincronizacao = useSincronizacaoStore((s) => s.ultimaSincronizacao);

  // "Debounce": cada tecla reinicia o temporizador; só busca quando a pessoa para de digitar
  useEffect(() => {
    const temporizador = setTimeout(() => {
      setResultados(texto.trim().length >= 2 ? buscarComSeguranca(texto) : []);
    }, ESPERA_DIGITACAO_MS);
    return () => clearTimeout(temporizador);
  }, [texto, ultimaSincronizacao]);

    /**
   * Busca no banco local sem derrubar a tela: se o SQLite recusar a consulta
   * (ex.: banco do aparelho desatualizado), mostra a mensagem no lugar dos resultados.
   */
  function buscarComSeguranca(termo: string): ProdutoResumo[] {
    try {
      return buscarPorTexto(termo);
    } catch (erro) {
      // O Drizzle guarda o erro original do SQLite em "cause"
      const causa = erro instanceof Error && erro.cause instanceof Error ? erro.cause : erro;
      setAviso(`Erro na busca: ${causa instanceof Error ? causa.message : String(causa)}`);
      return [];
    }
  }

  /** Um código veio da câmera, do coletor ou do Enter: abre o produto direto. */
  function abrirPorCodigo(codigo: string): void {
    const leitura = interpretarCodigo(codigo);
    if (leitura.tipo === 'INVALIDO') {
      setAviso(`Código não reconhecido (${leitura.motivo}). Leia de novo.`);
      return;
    }
    const encontrado = buscarPorLeitura(leitura);
    if (!encontrado) {
      setAviso(`O código ${leitura.codigo} não está cadastrado.`);
      return;
    }
    setAviso(null);
    setTexto('');
    setCameraAberta(false);
    // O código lido vai junto: a tela do produto mostra validade, lote ou preço da etiqueta
    router.push({
      pathname: '/produto/[id]',
      params: {
        id: encontrado.produto.id,
        codigo,
        embalagem: String(encontrado.quantidadeEmbalagem),
      },
    });
  }

  /** Enter no campo: se for um código válido, abre o produto; senão, é busca por texto. */
  function aoConfirmar(): void {
    const digitado = texto.trim();
    if (!digitado) return;
    const leitura = interpretarCodigo(digitado);
    if (leitura.tipo !== 'INVALIDO') {
      abrirPorCodigo(digitado);
    } else {
      const encontrados = buscarComSeguranca(digitado);
      setResultados(encontrados);
      // Parecia um código de barras (8 a 14 dígitos) e não achou nada: provavelmente leitura ruim
      if (encontrados.length === 0 && /^\d{8,14}$/.test(digitado)) {
        setAviso(`Código não reconhecido (${leitura.motivo}). Leia de novo.`);
      }
    }
    campo.current?.focus(); // pronto para o próximo bipe do coletor
  }

  return (
    <View style={estilos.tela}>
      <View style={estilos.cabecalho}>
        <CampoTexto
          ref={campo}
          rotulo="Descrição, código ou EAN"
          placeholder="Ex.: feijao carioca"
          value={texto}
          onChangeText={(valor) => {
            setTexto(valor);
            setAviso(null);
          }}
          onSubmitEditing={aoConfirmar}
          submitBehavior="submit"
          {...(Platform.OS === 'web' && { blurOnSubmit: false })}
          returnKeyType="search"
          autoCorrect={false}
          autoFocus
        />
        {/* No navegador não há leitor: lá a câmera não aparece */}
        {Platform.OS !== 'web' ? (
          <Botao
            titulo={cameraAberta ? 'Fechar câmera' : 'Ler com a câmera'}
            variante="secundario"
            onPress={() => setCameraAberta((aberta) => !aberta)}
          />
        ) : null}
        {cameraAberta ? <LeitorCamera aoLer={abrirPorCodigo} /> : null}
        {aviso ? (
          <Text style={estilos.aviso} accessibilityRole="alert">
            {aviso}
          </Text>
        ) : null}
      </View>

      <FlatList
        data={resultados}
        keyExtractor={(produto) => produto.id}
        contentContainerStyle={estilos.lista}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          texto.trim().length >= 2 && !aviso ? (
            <Text style={estilos.vazio}>Nenhum produto encontrado.</Text>
          ) : null
        }
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push({ pathname: '/produto/[id]', params: { id: item.id } })}
            style={({ pressed }) => [estilos.item, pressed && estilos.itemPressionado]}
          >
            <View style={estilos.itemTexto}>
              <Text style={estilos.descricao}>{item.descricao}</Text>
              <Text style={estilos.detalhe}>
                Cód. {item.codigoErp}
                {item.endereco ? ` · ${item.endereco}` : ''}
              </Text>
            </View>
            <View style={estilos.itemValores}>
              <Text style={estilos.preco}>{formatarMoeda(item.preco)}</Text>
              <Text style={estilos.detalhe}>{formatarQuantidade(item.saldo, item.unidade)}</Text>
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}

const estilos = StyleSheet.create({
  tela: { flex: 1 },
  cabecalho: { gap: 10, padding: 16, paddingBottom: 8 },
  aviso: {
    backgroundColor: cores.fundoErro,
    color: cores.erro,
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
  },
  lista: { paddingHorizontal: 16, paddingBottom: 16, gap: 8 },
  vazio: { textAlign: 'center', color: cores.textoSuave, marginTop: 16 },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 64,
    padding: 12,
    borderRadius: 10,
    backgroundColor: cores.cartao,
    borderWidth: 1,
    borderColor: cores.borda,
  },
  itemPressionado: { backgroundColor: cores.fundo },
  itemTexto: { flex: 1, gap: 2 },
  itemValores: { alignItems: 'flex-end', gap: 2 },
  descricao: { fontSize: 15, fontWeight: '600', color: cores.texto },
  detalhe: { fontSize: 13, color: cores.textoSuave },
  preco: { fontSize: 15, fontWeight: '700', color: cores.texto },
});
