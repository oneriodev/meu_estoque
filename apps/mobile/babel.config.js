// Babel transforma o nosso código antes de o Metro empacotá-lo.
// O plugin inline-import permite fazer "import sql from './0000_x.sql'":
// o conteúdo do arquivo .sql vira um texto dentro do app (assim as migrações vão junto no build).
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [['inline-import', { extensions: ['.sql'] }]],
  };
};
