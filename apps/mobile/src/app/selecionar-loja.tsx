import type { LojaResumo } from '@meu-estoque/shared';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Botao } from '@/components/Botao';
import { useSessaoStore } from '@/stores/sessaoStore';
import { cores } from '@/theme/cores';

/** Aparece só para quem tem mais de uma loja (supervisor de várias lojas, administrador). */
export default function TelaSelecionarLoja() {
  const usuario = useSessaoStore((s) => s.usuario);
  const escolherLoja = useSessaoStore((s) => s.escolherLoja);
  const sair = useSessaoStore((s) => s.sair);

  const lojas = usuario?.lojas ?? [];

  return (
    <SafeAreaView style={estilos.tela}>
      <Text style={estilos.titulo}>Em qual loja você está?</Text>
      <Text style={estilos.subtitulo}>Olá, {usuario?.nome}. Escolha a loja para começar.</Text>

      <FlatList<LojaResumo>
        data={lojas}
        keyExtractor={(loja) => loja.id}
        contentContainerStyle={estilos.lista}
        ListEmptyComponent={
          <Text style={estilos.vazio}>
            Nenhuma loja vinculada ao seu usuário. Fale com o seu gestor.
          </Text>
        }
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="button"
            onPress={() => void escolherLoja(item)}
            style={({ pressed }) => [estilos.item, pressed && estilos.itemPressionado]}
          >
            <View style={estilos.codigo}>
              <Text style={estilos.textoCodigo}>{item.codigo}</Text>
            </View>
            <Text style={estilos.nomeLoja}>{item.nome}</Text>
          </Pressable>
        )}
      />

      <Botao titulo="Sair" variante="perigo" onPress={() => void sair()} />
    </SafeAreaView>
  );
}

const estilos = StyleSheet.create({
  tela: { flex: 1, backgroundColor: cores.fundo, padding: 20, gap: 8 },
  titulo: { fontSize: 24, fontWeight: '800', color: cores.texto, marginTop: 16 },
  subtitulo: { fontSize: 15, color: cores.textoSuave, marginBottom: 8 },
  lista: { gap: 10, paddingVertical: 8 },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    minHeight: 64,
    padding: 14,
    borderRadius: 10,
    backgroundColor: cores.cartao,
    borderWidth: 1,
    borderColor: cores.borda,
  },
  itemPressionado: { backgroundColor: cores.fundo },
  codigo: {
    backgroundColor: cores.destaque,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  textoCodigo: { fontWeight: '800', color: cores.textoSobreDestaque },
  nomeLoja: { fontSize: 16, color: cores.texto, flexShrink: 1 },
  vazio: { fontSize: 15, color: cores.textoSuave, textAlign: 'center', marginTop: 24 },
});
