import { interpretarCodigo, type LeituraCodigo } from '@meu-estoque/shared';
import { useState } from 'react';
import { FlatList, Platform, StyleSheet, Text, View } from 'react-native';
import { CampoLeitura } from '@/components/CampoLeitura';
import { LeitorCamera } from '@/components/LeitorCamera';
import { cores } from '@/theme/cores';

interface Leitura {
  id: number;
  resultado: LeituraCodigo;
}

/** Frases para o operador conferir o que foi lido. */
function descrever(resultado: LeituraCodigo): { titulo: string; linhas: string[] } {
  switch (resultado.tipo) {
    case 'GTIN':
      return { titulo: `Código de produto (${resultado.formato})`, linhas: [resultado.codigo] };
    case 'BALANCA':
      return {
        titulo: 'Etiqueta de balança',
        linhas: [
          `Produto: ${resultado.codigoProduto}`,
          resultado.tipoValor === 'PRECO'
            ? `Preço: R$ ${resultado.valor.replace('.', ',')}`
            : `Peso: ${resultado.valor.replace('.', ',')} kg`,
        ],
      };
    case 'GS1':
      return {
        titulo: 'GS1 (com dados do lote)',
        linhas: [
          `GTIN: ${resultado.gtin ?? '—'}`,
          `Lote: ${resultado.lote ?? '—'}`,
          // "2026-11-30" → "30/11/2026"
          `Validade: ${resultado.validade?.split('-').reverse().join('/') ?? '—'}`,
          ...(resultado.pesoKg ? [`Peso: ${resultado.pesoKg.replace('.', ',')} kg`] : []),
        ],
      };
    case 'INVALIDO':
      return { titulo: 'Não reconhecido', linhas: [resultado.motivo, `Lido: ${resultado.codigo}`] };
  }
}

/**
 * Tela de teste do leitor (Etapa 7A): mostra como o app interpretou cada código.
 * Na 7B, a mesma leitura passa a abrir o produto encontrado no banco local.
 */
export default function TelaLeitor() {
  const [leituras, setLeituras] = useState<Leitura[]>([]);

  function aoLer(codigo: string): void {
    const leitura = { id: Date.now(), resultado: interpretarCodigo(codigo) };
    // Mais recente primeiro, guardando só as 10 últimas
    setLeituras((anteriores) => [leitura, ...anteriores].slice(0, 10));
  }

  // A câmera e o campo ficam FORA da lista: assim não são recriados a cada leitura
  // (recriar a câmera a cada bipe seria lento, e o campo perderia o foco do coletor)
  return (
    <View style={estilos.tela}>
      <View style={estilos.cabecalho}>
        {/* No navegador não há leitor de código: lá testamos digitando ou colando */}
        {Platform.OS !== 'web' ? <LeitorCamera aoLer={aoLer} /> : null}
        <CampoLeitura aoLer={aoLer} />
        {leituras.length > 0 ? <Text style={estilos.rotulo}>Últimas leituras</Text> : null}
      </View>
      <FlatList
        data={leituras}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={estilos.lista}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => {
          const { titulo, linhas } = descrever(item.resultado);
          const invalido = item.resultado.tipo === 'INVALIDO';
          return (
            <View style={[estilos.cartao, invalido && estilos.cartaoInvalido]}>
              <Text style={[estilos.titulo, invalido && estilos.tituloInvalido]}>{titulo}</Text>
              {linhas.map((linha) => (
                <Text key={linha} style={estilos.linha}>
                  {linha}
                </Text>
              ))}
            </View>
          );
        }}
      />
    </View>
  );
}

const estilos = StyleSheet.create({
  tela: { flex: 1 },
  cabecalho: { gap: 14, padding: 16, paddingBottom: 6 },
  lista: { paddingHorizontal: 16, paddingBottom: 16, gap: 10 },
  rotulo: { fontSize: 11, letterSpacing: 0.6, textTransform: 'uppercase', color: cores.textoSuave },
  cartao: {
    backgroundColor: cores.cartao,
    borderColor: cores.borda,
    borderWidth: 1,
    borderRadius: 10,
    padding: 14,
    gap: 4,
  },
  cartaoInvalido: { borderColor: cores.fundoErro },
  titulo: { fontSize: 15, fontWeight: '700', color: cores.texto },
  tituloInvalido: { color: cores.erro },
  linha: { fontSize: 14, color: cores.texto },
});
