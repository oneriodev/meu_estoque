import {
  CameraView,
  useCameraPermissions,
  type BarcodeScanningResult,
  type BarcodeType,
} from 'expo-camera';
import { useRef, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, Vibration, View } from 'react-native';
import { Botao } from '@/components/Botao';
import { cores } from '@/theme/cores';

/** Formatos lidos. Menos formatos = leitura mais rápida e menos leituras falsas. */
const FORMATOS: BarcodeType[] = [
  'ean13', // produtos em geral e etiqueta de balança
  'ean8', // embalagens pequenas
  'upc_a', // importados
  'upc_e',
  'itf14', // caixas de embarque
  'code128', // GS1-128: lote e validade nas caixas
  'datamatrix', // GS1 DataMatrix: lote e validade em medicamentos e alguns alimentos
];

/** A câmera lê o mesmo código várias vezes por segundo: ignoramos repetições por este tempo. */
const INTERVALO_REPETICAO_MS = 2_500;

interface LeitorCameraProps {
  /** Chamado uma vez por código lido (já sem repetições) */
  aoLer: (codigo: string) => void;
}

/**
 * Leitor de código de barras pela câmera do aparelho.
 * A leitura acontece NO APARELHO (Google ML Kit): nenhuma imagem sai do celular,
 * e funciona sem internet (câmara fria, depósito).
 */
export function LeitorCamera({ aoLer }: LeitorCameraProps) {
  const [permissao, pedirPermissao] = useCameraPermissions();
  const [lanterna, setLanterna] = useState(false);
  // useRef guarda um valor entre renderizações SEM redesenhar a tela quando muda
  const ultima = useRef<{ codigo: string; em: number } | null>(null);

  if (!permissao) return <View style={estilos.area} />; // ainda consultando a permissão

  if (!permissao.granted) {
    return (
      <View style={[estilos.area, estilos.semPermissao]}>
        <Text style={estilos.textoPermissao}>
          Para ler códigos pela câmera, o app precisa de permissão para usá-la.
        </Text>
        {permissao.canAskAgain ? (
          <Botao titulo="Permitir câmera" onPress={() => void pedirPermissao()} />
        ) : (
          // O usuário negou de vez: só nas configurações do Android dá para liberar
          <Botao
            titulo="Abrir configurações"
            variante="secundario"
            onPress={() => void Linking.openSettings()}
          />
        )}
      </View>
    );
  }

  function aoEscanear(resultado: BarcodeScanningResult): void {
    // "raw" preserva o separador GS dos códigos GS1; "data" é a versão "para exibir"
    const codigo = resultado.raw ?? resultado.data;
    const agora = Date.now();
    if (
      ultima.current &&
      ultima.current.codigo === codigo &&
      agora - ultima.current.em < INTERVALO_REPETICAO_MS
    ) {
      return;
    }
    ultima.current = { codigo, em: agora };
    Vibration.vibrate(60); // retorno tátil: o operador sabe que leu sem olhar a tela
    aoLer(codigo);
  }

  return (
    <View style={estilos.area}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        enableTorch={lanterna}
        barcodeScannerSettings={{ barcodeTypes: FORMATOS }}
        onBarcodeScanned={aoEscanear}
      />
      {/* Moldura: mostra onde posicionar o código */}
      <View pointerEvents="none" style={estilos.moldura} />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={lanterna ? 'Desligar lanterna' : 'Ligar lanterna'}
        onPress={() => setLanterna((ligada) => !ligada)}
        style={estilos.botaoLanterna}
      >
        <Text style={estilos.textoLanterna}>{lanterna ? 'Lanterna: ligada' : 'Lanterna'}</Text>
      </Pressable>
    </View>
  );
}

const estilos = StyleSheet.create({
  area: {
    height: 260,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#000000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  semPermissao: { backgroundColor: cores.cartao, padding: 16, gap: 12 },
  textoPermissao: { color: cores.texto, fontSize: 15, textAlign: 'center' },
  moldura: {
    width: '78%',
    height: 120,
    borderWidth: 3,
    borderColor: cores.destaque,
    borderRadius: 10,
  },
  botaoLanterna: {
    position: 'absolute',
    bottom: 10,
    right: 10,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  textoLanterna: { color: '#FFFFFF', fontWeight: '600' },
});
