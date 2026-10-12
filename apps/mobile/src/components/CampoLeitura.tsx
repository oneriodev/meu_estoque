import { useRef, useState } from 'react';
import { Platform, type TextInput } from 'react-native';
import { CampoTexto } from '@/components/CampoTexto';

interface CampoLeituraProps {
  aoLer: (codigo: string) => void;
}

/**
 * Campo para coletor de dados (ou digitação).
 * Coletores e leitores USB/Bluetooth em "modo teclado" (HID) "digitam" o código
 * muito rápido e apertam Enter no final: para o app, é como se alguém digitasse.
 * Depois de cada leitura o campo é limpo e continua focado, pronto para o próximo bipe.
 */
export function CampoLeitura({ aoLer }: CampoLeituraProps) {
  const [texto, setTexto] = useState('');
  const campo = useRef<TextInput>(null);

  function enviar(): void {
    const codigo = texto.trim();
    if (codigo) aoLer(codigo);
    setTexto('');
    campo.current?.focus();
  }

  return (
    <CampoTexto
      ref={campo}
      rotulo="Código (bipe com o coletor ou digite)"
      placeholder="Ex.: 7891234567895"
      value={texto}
      onChangeText={setTexto}
      onSubmitEditing={enviar}
      // Mantém o foco após o Enter (o coletor manda Enter a cada leitura).
      // No Android vale o submitBehavior; o navegador (react-native-web) ainda usa blurOnSubmit.
      submitBehavior="submit"
      {...(Platform.OS === 'web' && { blurOnSubmit: false })}
      returnKeyType="search"
      autoCapitalize="characters"
      autoCorrect={false}
    />
  );
}
