import { Injectable } from '@nestjs/common';
import { hash, verify } from '@node-rs/argon2';

/**
 * Parâmetros do argon2id recomendados pela OWASP: 19 MiB de memória,
 * 2 iterações, 1 thread. Gastar memória de propósito torna caro
 * testar bilhões de senhas, mesmo com placas de vídeo.
 */
export const OPCOES_ARGON2 = { memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;

@Injectable()
export class SenhaService {
  /**
   * Hash de uma senha qualquer, calculado uma vez. Usado quando o login
   * não existe, para a resposta demorar o mesmo tempo (ver AuthService).
   */
  private readonly hashFalso = hash('senha-que-ninguem-usa', OPCOES_ARGON2);

  gerarHash(senha: string): Promise<string> {
    return hash(senha, OPCOES_ARGON2);
  }

  /** Compara a senha digitada com o hash guardado no banco. */
  async conferir(hashGuardado: string | undefined, senha: string): Promise<boolean> {
    try {
      return await verify(hashGuardado ?? (await this.hashFalso), senha);
    } catch {
      return false;
    }
  }
}
