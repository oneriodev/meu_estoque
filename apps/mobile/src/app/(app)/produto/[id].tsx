import {
  diasAte,
  formatarData,
  formatarMoeda,
  formatarQuantidade,
  interpretarCodigo,
  type LeituraCodigo,
} from '@meu-estoque/shared';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { detalharProduto } from '@/db/repositorios/produtoRepositorio';
import { useSincronizacaoStore } from '@/stores/sincronizacaoStore';
import { cores } from '@/theme/cores';

/** "vence em 5 dias", "vence hoje", "venceu há 2 dias". */
function prazo(validade: string): { texto: string; cor: string } {
  const dias = diasAte(validade);
  if (dias < 0) {
    return { texto: `venceu há ${-dias} dia${dias === -1 ? '' : 's'}`, cor: cores.erro };
  }
  if (dias === 0) return { texto: 'vence hoje', cor: cores.erro };
  return {
    texto: `vence em ${dias} dia${dias === 1 ? '' : 's'}`,
    // Faixas de alerta provisórias; na Etapa 9 elas vêm dos parâmetros da categoria (D-30, D-15, D-7)
    cor: dias <= 7 ? cores.erro : dias <= 30 ? '#8A5A00' : cores.sucesso,
  };
}

/** O que a etiqueta lida informa além do produto (preço da balança, lote e validade do GS1...). */
function informacaoDaEtiqueta(
  leitura: LeituraCodigo | null,
  quantidadeCaixa: number,
): string | null {
  if (!leitura) return null;
  if (leitura.tipo === 'BALANCA') {
    return leitura.tipoValor === 'PRECO'
      ? `Etiqueta de balança: ${formatarMoeda(leitura.valor)}`
      : `Etiqueta de balança: ${formatarQuantidade(leitura.valor, 'KG')}`;
  }
  if (leitura.tipo === 'GS1') {
    const partes = [
      leitura.lote ? `lote ${leitura.lote}` : null,
      leitura.validade
        ? `validade ${formatarData(leitura.validade)} (${prazo(leitura.validade).texto})`
        : null,
      leitura.pesoKg ? formatarQuantidade(leitura.pesoKg, 'KG') : null,
    ].filter(Boolean);
    return partes.length ? `Etiqueta: ${partes.join(' · ')}` : null;
  }
  if (quantidadeCaixa > 1) return `Código da caixa com ${quantidadeCaixa} unidades`;
  return null;
}

/**
 * Detalhe do produto. A rota "produto/[id]" é DINÂMICA: o [id] do nome do arquivo
 * vira um parâmetro (useLocalSearchParams), como /produto/01a1... na URL.
 */
export default function TelaProduto() {
  const { id, codigo, embalagem } = useLocalSearchParams<{
    id: string;
    codigo?: string;
    embalagem?: string;
  }>();
  const ultimaSincronizacao = useSincronizacaoStore((s) => s.ultimaSincronizacao);

  // useMemo: só consulta o banco de novo se o produto ou a sincronização mudarem
  const produto = useMemo(
    () => detalharProduto(id),
    // ultimaSincronizacao não é usada dentro: está aqui para refazer a consulta após cada sincronização
    [id, ultimaSincronizacao],
  );
  const leitura = useMemo(() => (codigo ? interpretarCodigo(codigo) : null), [codigo]);

  if (!produto) {
    return (
      <View style={estilos.conteudo}>
        <Text style={estilos.texto}>Produto não encontrado no aparelho.</Text>
      </View>
    );
  }

  // Quantas unidades o código lido representa (vem da busca: 6 = leu o código da caixa)
  const quantidadeCaixa = Number(embalagem ?? '1');
  const etiqueta = informacaoDaEtiqueta(leitura, quantidadeCaixa);
  // FEFO: o lote NÃO vencido com a validade mais próxima é o que vai para a frente da gôndola
  const primeiroValido = produto.lotes.find((lote) => diasAte(lote.validade) >= 0);
  const saldoNumero = produto.saldo === null ? null : Number(produto.saldo); // só para comparar com zero

  return (
    <ScrollView contentContainerStyle={estilos.conteudo}>
      <Stack.Screen options={{ title: produto.descricao }} />

      <View style={estilos.cartao}>
        <Text style={estilos.titulo}>{produto.descricao}</Text>
        <Text style={estilos.detalhe}>
          Cód. {produto.codigoErp} · {produto.categoria ?? 'Sem categoria'} ·{' '}
          {produto.unidade === 'KG' ? 'vendido por peso' : 'vendido por unidade'}
        </Text>
      </View>

      {etiqueta ? <Text style={estilos.etiqueta}>{etiqueta}</Text> : null}

      <View style={estilos.cartao}>
        <Text style={estilos.rotulo}>Nesta loja</Text>
        {produto.preco === null ? (
          <Text style={estilos.texto}>Produto sem cadastro nesta loja.</Text>
        ) : (
          <>
            <Text style={estilos.preco}>{formatarMoeda(produto.preco)}</Text>
            <Text style={estilos.texto}>
              Estoque: {formatarQuantidade(produto.saldo, produto.unidade)}
              {saldoNumero !== null && saldoNumero < 0 ? '  ·  estoque negativo' : ''}
              {saldoNumero === 0 ? '  ·  sem estoque' : ''}
            </Text>
            <Text style={estilos.texto}>Endereço: {produto.endereco ?? 'não informado'}</Text>
          </>
        )}
      </View>

      <View style={estilos.cartao}>
        <Text style={estilos.rotulo}>Validades (o que vence primeiro sai primeiro)</Text>
        {!produto.controlaLote ? (
          <Text style={estilos.texto}>Este produto não controla lote e validade.</Text>
        ) : produto.lotes.length === 0 ? (
          <Text style={estilos.texto}>Nenhum lote cadastrado. O cadastro chega na Etapa 9.</Text>
        ) : (
          produto.lotes.map((lote) => {
            const { texto, cor } = prazo(lote.validade);
            const vencido = diasAte(lote.validade) < 0;
            return (
              <View key={lote.id} style={estilos.lote}>
                <Text style={estilos.texto}>
                  {formatarData(lote.validade)} {lote.codigo ? `· lote ${lote.codigo}` : ''}
                  {/* Vencido sai da gôndola; dos que estão bons, o mais próximo sai primeiro */}
                  {vencido ? '  ·  retirar da gôndola' : ''}
                  {lote.id === primeiroValido?.id ? '  ·  sai primeiro' : ''}
                </Text>
                <Text style={[estilos.prazo, { color: cor }]}>{texto}</Text>
              </View>
            );
          })
        )}
      </View>

      <View style={estilos.cartao}>
        <Text style={estilos.rotulo}>Códigos de barras</Text>
        {produto.codigos.map((c) => (
          <Text key={c.codigo} style={estilos.texto}>
            {c.codigo} ·{' '}
            {c.quantidadeEmbalagem === 1 ? 'unidade' : `caixa com ${c.quantidadeEmbalagem}`}
          </Text>
        ))}
        {produto.codigos.length === 0 ? (
          <Text style={estilos.texto}>Sem código de barras (produto de balança).</Text>
        ) : null}
      </View>

      <View style={estilos.cartao}>
        <Text style={estilos.rotulo}>Tarefas abertas</Text>
        <Text style={estilos.texto}>As tarefas chegam na Etapa 8.</Text>
      </View>

      {/* Transparência do offline: a pessoa sabe de quando são os dados que está vendo */}
      <Text style={estilos.rodape}>
        Dados do aparelho
        {ultimaSincronizacao
          ? ` · sincronizados às ${new Date(ultimaSincronizacao).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
          : ''}
      </Text>
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
    gap: 6,
  },
  rotulo: { fontSize: 11, letterSpacing: 0.6, textTransform: 'uppercase', color: cores.textoSuave },
  titulo: { fontSize: 20, fontWeight: '800', color: cores.texto },
  detalhe: { fontSize: 13, color: cores.textoSuave },
  preco: { fontSize: 28, fontWeight: '800', color: cores.texto },
  texto: { fontSize: 15, color: cores.texto },
  etiqueta: {
    backgroundColor: cores.destaque,
    color: cores.textoSobreDestaque,
    fontWeight: '700',
    borderRadius: 8,
    padding: 12,
    fontSize: 15,
  },
  lote: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' },
  prazo: { fontSize: 14, fontWeight: '700' },
  rodape: { fontSize: 12, color: cores.textoSuave, textAlign: 'center' },
});
