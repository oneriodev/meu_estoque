// Permite importar arquivos .sql (as migrações do Drizzle viram texto pelo babel-plugin-inline-import)
declare module '*.sql' {
  const conteudo: string;
  export default conteudo;
}
