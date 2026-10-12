import { drizzle, type ExpoSQLiteDatabase } from 'drizzle-orm/expo-sqlite';
import { migrate } from 'drizzle-orm/expo-sqlite/migrator';
import { openDatabaseAsync } from 'expo-sqlite';
import migracoes from '../../drizzle/migrations';
import * as schema from './schema';

export type BancoLocal = ExpoSQLiteDatabase<typeof schema>;
/** Tipo de uma transação: os repositórios aceitam o banco ou uma transação. */
export type TransacaoLocal = Parameters<Parameters<BancoLocal['transaction']>[0]>[0];

let instancia: BancoLocal | null = null;
let abrindo: Promise<BancoLocal> | null = null;

/**
 * Abre o banco local e aplica as migrações que faltam. Chamado UMA vez, quando o app abre.
 *
 * O arquivo fica na área privada do app no aparelho: outros apps não conseguem lê-lo,
 * e ele é apagado se o app for desinstalado.
 *
 * A abertura é assíncrona de propósito: na web (só desenvolvimento) o SQLite roda num
 * Worker, e uma operação síncrona antes de o Worker iniciar travaria a página.
 */
export function abrirBancoLocal(): Promise<BancoLocal> {
  abrindo ??= (async () => {
    const sqlite = await openDatabaseAsync('meu-estoque.db');
    try {
      // WAL ("write-ahead log"): leituras não ficam esperando as gravações do pull
      await sqlite.execAsync('PRAGMA journal_mode = WAL;');
    } catch {
      // Na web esse modo pode não existir; é só uma otimização
    }
    const banco = drizzle(sqlite, { schema });
    // Cria ou atualiza as tabelas: aplica só as migrações que ainda não rodaram neste aparelho
    await migrate(banco, migracoes);
    instancia = banco;
    return banco;
  })();
  return abrindo;
}

/** O banco já aberto. Os repositórios usam esta função (o _layout raiz garante a abertura antes). */
export function bancoLocal(): BancoLocal {
  if (!instancia) throw new Error('O banco local ainda não foi aberto');
  return instancia;
}
