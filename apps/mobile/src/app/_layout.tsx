import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

/**
 * Layout raiz: envolve todas as telas do app.
 * O Stack é a navegação em "pilha": cada tela nova entra por cima da anterior.
 */
export default function LayoutRaiz() {
  return (
    <>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false }} />
    </>
  );
}