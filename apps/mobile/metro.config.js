// Configuração do Metro (o empacotador do React Native).
const http = require('node:http');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Migrações do Drizzle são arquivos .sql importados pelo código
config.resolver.sourceExts.push('sql');

// ─── Web (SÓ para testar no navegador durante o desenvolvimento) ──────────────
// No navegador, o SQLite roda em WebAssembly (.wasm) dentro de um Worker e precisa de
// SharedArrayBuffer. O navegador só libera isso em páginas "isoladas", que recebem
// estes dois cabeçalhos. No Android e no iOS nada disto é usado.
config.resolver.assetExts.push('wasm');

const CABECALHOS_ISOLAMENTO = {
  'Cross-Origin-Embedder-Policy': 'credentialless',
  'Cross-Origin-Opener-Policy': 'same-origin',
};

// O servidor de desenvolvimento do Expo responde a página HTML antes de passar pelo Metro,
// então a forma confiável de colocar os cabeçalhos em TODAS as respostas é interceptar
// o envio dos cabeçalhos HTTP deste processo (que é só o servidor de desenvolvimento).
const writeHeadOriginal = http.ServerResponse.prototype.writeHead;
http.ServerResponse.prototype.writeHead = function (...argumentos) {
  if (!this.headersSent) {
    for (const [nome, valor] of Object.entries(CABECALHOS_ISOLAMENTO)) this.setHeader(nome, valor);
  }
  return writeHeadOriginal.apply(this, argumentos);
};

module.exports = config;
