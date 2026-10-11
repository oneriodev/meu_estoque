import { zodResolver } from '@hookform/resolvers/zod';
import { loginRequestSchema } from '@meu-estoque/shared';
import { useRef, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { z } from 'zod';
import { Botao } from '@/components/Botao';
import { CampoTexto } from '@/components/CampoTexto';
import { ErroApi } from '@/services/api';
import { API_URL } from '@/services/config';
import { useSessaoStore } from '@/stores/sessaoStore';
import { cores } from '@/theme/cores';

// O schema transforma os dados (trim, minúsculas), então o que o usuário DIGITA
// (entrada) e o que sai validado (saída) são tipos diferentes para o TypeScript
type EntradaLogin = z.input<typeof loginRequestSchema>;
type SaidaLogin = z.output<typeof loginRequestSchema>;

/** Traduz o erro da API para uma frase que o operador entende. */
function mensagemDeErro(erro: unknown): string {
  if (!(erro instanceof ErroApi)) return 'Algo deu errado. Tente novamente.';
  if (erro.status === 401) return 'Login ou senha inválidos.';
  if (erro.status === 429) return 'Muitas tentativas. Aguarde 1 minuto e tente de novo.';
  if (erro.status === 0) return 'Sem conexão com o servidor. Verifique a rede.';
  return erro.message;
}

export default function TelaLogin() {
  const entrar = useSessaoStore((s) => s.entrar);
  const [erroGeral, setErroGeral] = useState<string | null>(null);
  const campoSenha = useRef<TextInput>(null);

  // O MESMO schema que a API usa valida o formulário: as regras ficam num lugar só
  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<EntradaLogin, unknown, SaidaLogin>({
    resolver: zodResolver(loginRequestSchema),
    defaultValues: { login: '', senha: '' },
  });

  const enviar = handleSubmit(async (dados) => {
    setErroGeral(null);
    try {
      await entrar(dados);
      // Não precisa navegar: o _layout percebe a sessão nova e troca as telas
    } catch (erro) {
      setErroGeral(mensagemDeErro(erro));
    }
  });

  return (
    <SafeAreaView style={estilos.tela}>
      <KeyboardAvoidingView
        style={estilos.tela}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={estilos.conteudo} keyboardShouldPersistTaps="handled">
          <View style={estilos.marca}>
            <View style={estilos.etiqueta} />
            <Text style={estilos.titulo}>Meu Estoque</Text>
          </View>
          <Text style={estilos.subtitulo}>Entre com o login fornecido pelo seu gestor.</Text>

          <Controller
            control={control}
            name="login"
            render={({ field: { onChange, onBlur, value } }) => (
              <CampoTexto
                rotulo="Login"
                placeholder="ex.: operador.01"
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="username"
                textContentType="username"
                returnKeyType="next"
                onSubmitEditing={() => campoSenha.current?.focus()}
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                erro={errors.login?.message}
              />
            )}
          />

          <Controller
            control={control}
            name="senha"
            render={({ field: { onChange, onBlur, value } }) => (
              <CampoTexto
                ref={campoSenha}
                rotulo="Senha"
                secureTextEntry
                autoCapitalize="none"
                autoComplete="current-password"
                textContentType="password"
                returnKeyType="go"
                onSubmitEditing={() => void enviar()}
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                erro={errors.senha?.message}
              />
            )}
          />

          {erroGeral ? (
            <Text style={estilos.erroGeral} accessibilityRole="alert">
              {erroGeral}
            </Text>
          ) : null}

          <Botao titulo="Entrar" onPress={() => void enviar()} carregando={isSubmitting} />

          {/* Só em desenvolvimento: mostra para qual API o app está apontando */}
          {__DEV__ ? <Text style={estilos.rodape}>API: {API_URL}</Text> : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const estilos = StyleSheet.create({
  tela: { flex: 1, backgroundColor: cores.fundo },
  conteudo: { flexGrow: 1, justifyContent: 'center', padding: 24, gap: 16 },
  marca: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  etiqueta: { width: 34, height: 26, borderRadius: 3, backgroundColor: cores.destaque },
  titulo: { fontSize: 28, fontWeight: '800', color: cores.texto },
  subtitulo: { fontSize: 15, color: cores.textoSuave, marginBottom: 8 },
  erroGeral: {
    backgroundColor: cores.fundoErro,
    color: cores.erro,
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
  },
  rodape: { fontSize: 12, color: cores.textoSuave, textAlign: 'center', marginTop: 8 },
});
