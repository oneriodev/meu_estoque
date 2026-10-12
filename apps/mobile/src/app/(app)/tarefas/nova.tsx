import { zodResolver } from '@hookform/resolvers/zod';
import {
  dadosCriarTarefaSchema,
  NOMES_TIPOS,
  PRIORIDADE_URGENTE,
  tipoTarefaSchema,
} from '@meu-estoque/shared';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { z } from 'zod';
import { Botao } from '@/components/Botao';
import { CampoTexto } from '@/components/CampoTexto';
import { detalharProduto } from '@/db/repositorios/produtoRepositorio';
import { ehGestor } from '@/services/permissoes';
import { criarTarefa } from '@/services/tarefasService';
import { useSessaoStore } from '@/stores/sessaoStore';
import { cores } from '@/theme/cores';

/**
 * O formulário reaproveita as regras do schema compartilhado (título 3-120 letras, tipo válido)
 * e acrescenta só o que é da tela: o "urgente" vira prioridade e a descrição vazia vira "sem descrição".
 */
const formularioSchema = dadosCriarTarefaSchema.pick({ tipo: true, titulo: true }).extend({
  descricao: z.string().trim().max(1000),
  urgente: z.boolean(),
});
type Formulario = z.infer<typeof formularioSchema>;

/**
 * Nova tarefa (manual). Funciona offline: o id nasce no aparelho e a tarefa entra
 * na outbox. Quando aberta a partir de um produto, já vem ligada a ele.
 */
export default function TelaNovaTarefa() {
  const router = useRouter();
  const { produtoId } = useLocalSearchParams<{ produtoId?: string }>();
  const usuario = useSessaoStore((s) => s.usuario);
  const produto = useMemo(() => (produtoId ? detalharProduto(produtoId) : null), [produtoId]);

  // Contagem/inventário é planejada pelo gestor (a API também recusa de operador)
  const tipos = tipoTarefaSchema.options.filter(
    (tipo) => tipo !== 'CONTAGEM' || ehGestor(usuario?.papel),
  );

  const {
    control,
    handleSubmit,
    watch,
    setValue,
    getFieldState,
    formState: { errors },
  } = useForm<Formulario>({
    resolver: zodResolver(formularioSchema),
    defaultValues: {
      tipo: produto ? 'REPOSICAO' : 'MANUAL',
      titulo: produto ? `${NOMES_TIPOS.REPOSICAO}: ${produto.descricao}` : '',
      descricao: '',
      urgente: false,
    },
  });

  // Troca de tipo com produto: atualiza o título sugerido, MAS só se a pessoa não o editou
  const tipo = watch('tipo');
  useEffect(() => {
    if (produto && !getFieldState('titulo').isDirty) {
      setValue('titulo', `${NOMES_TIPOS[tipo]}: ${produto.descricao}`.slice(0, 120));
    }
  }, [tipo, produto, getFieldState, setValue]);

  const salvar = handleSubmit((dados) => {
    const tarefaId = criarTarefa({
      tipo: dados.tipo,
      titulo: dados.titulo,
      ...(dados.descricao && { descricao: dados.descricao }),
      ...(produto && { produtoId: produto.id }),
      prioridade: dados.urgente ? PRIORIDADE_URGENTE : 0,
    });
    // replace: o "voltar" da tela da tarefa não deve reabrir o formulário
    router.replace({ pathname: '/tarefas/[id]', params: { id: tarefaId } });
  });

  return (
    <ScrollView contentContainerStyle={estilos.conteudo} keyboardShouldPersistTaps="handled">
      {produto ? (
        <View style={estilos.cartao}>
          <Text style={estilos.rotulo}>Produto</Text>
          <Text style={estilos.subtitulo}>{produto.descricao}</Text>
          <Text style={estilos.detalhe}>Endereço: {produto.endereco ?? 'não informado'}</Text>
        </View>
      ) : null}

      <Text style={estilos.rotulo}>Tipo</Text>
      <Controller
        control={control}
        name="tipo"
        render={({ field: { value, onChange } }) => (
          <View style={estilos.chips} accessibilityRole="radiogroup">
            {tipos.map((opcao) => (
              <Pressable
                key={opcao}
                accessibilityRole="radio"
                accessibilityState={{ checked: value === opcao }}
                onPress={() => onChange(opcao)}
                style={[estilos.chip, value === opcao && estilos.chipAtivo]}
              >
                <Text style={[estilos.textoChip, value === opcao && estilos.textoChipAtivo]}>
                  {NOMES_TIPOS[opcao]}
                </Text>
              </Pressable>
            ))}
          </View>
        )}
      />

      <Controller
        control={control}
        name="titulo"
        render={({ field: { value, onChange, onBlur } }) => (
          <CampoTexto
            rotulo="O que precisa ser feito"
            placeholder="Ex.: repor a ponta de gôndola do corredor 3"
            value={value}
            onChangeText={onChange}
            onBlur={onBlur}
            erro={errors.titulo?.message}
            maxLength={120}
          />
        )}
      />

      <Controller
        control={control}
        name="descricao"
        render={({ field: { value, onChange, onBlur } }) => (
          <CampoTexto
            rotulo="Detalhes (opcional)"
            placeholder="Onde, quanto, o que foi visto..."
            value={value}
            onChangeText={onChange}
            onBlur={onBlur}
            erro={errors.descricao?.message}
            multiline
            maxLength={1000}
            style={estilos.multilinha}
          />
        )}
      />

      <Controller
        control={control}
        name="urgente"
        render={({ field: { value, onChange } }) => (
          <View style={estilos.linha}>
            <Text style={estilos.texto}>Urgente (vai para o topo da fila)</Text>
            <Switch value={value} onValueChange={onChange} accessibilityLabel="Urgente" />
          </View>
        )}
      />

      {/* LGPD: o texto vai para o histórico da loja; nada de dados pessoais de clientes */}
      <Text style={estilos.detalhe}>
        Não escreva nomes ou dados de clientes: a tarefa fica no histórico da loja.
      </Text>

      <Botao titulo="Criar tarefa" onPress={() => void salvar()} />
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
    gap: 4,
  },
  rotulo: { fontSize: 11, letterSpacing: 0.6, textTransform: 'uppercase', color: cores.textoSuave },
  subtitulo: { fontSize: 16, fontWeight: '700', color: cores.texto },
  texto: { fontSize: 15, color: cores.texto, flexShrink: 1 },
  detalhe: { fontSize: 13, color: cores.textoSuave },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: cores.borda,
    backgroundColor: cores.cartao,
  },
  chipAtivo: { backgroundColor: cores.destaque, borderColor: cores.destaque },
  textoChip: { fontSize: 14, color: cores.texto, fontWeight: '600' },
  textoChipAtivo: { color: cores.textoSobreDestaque },
  multilinha: { minHeight: 90, textAlignVertical: 'top', paddingTop: 12 },
  linha: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
});
