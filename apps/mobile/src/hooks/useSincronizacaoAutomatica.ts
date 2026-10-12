import * as Network from 'expo-network';
import { useEffect } from 'react';
import { AppState } from 'react-native';
import { useSincronizacaoStore } from '@/stores/sincronizacaoStore';

/** De quanto em quanto tempo sincroniza enquanto o app está aberto. */
const INTERVALO_MS = 5 * 60_000;

/**
 * Liga a sincronização em segundo plano enquanto o componente estiver na tela.
 * Gatilhos: ao entrar, quando o app volta ao primeiro plano, quando a internet volta
 * e a cada 5 minutos. O operador não precisa apertar nada.
 */
export function useSincronizacaoAutomatica(): void {
  useEffect(() => {
    const sincronizar = () => void useSincronizacaoStore.getState().sincronizar();

    useSincronizacaoStore.getState().atualizarContagens();
    sincronizar();

    const aoMudarEstadoDoApp = AppState.addEventListener('change', (estado) => {
      if (estado === 'active') sincronizar();
    });

    // Só reage quando a internet VOLTA (estava sem e passou a ter)
    let tinhaInternet: boolean | undefined;
    const aoMudarRede = Network.addNetworkStateListener((rede) => {
      const temInternet = rede.isInternetReachable ?? rede.isConnected ?? false;
      if (temInternet && tinhaInternet === false) sincronizar();
      tinhaInternet = temInternet;
    });

    const temporizador = setInterval(sincronizar, INTERVALO_MS);

    // Função de limpeza: roda quando o componente sai da tela (logout, troca de loja)
    return () => {
      aoMudarEstadoDoApp.remove();
      aoMudarRede.remove();
      clearInterval(temporizador);
    };
  }, []);
}
