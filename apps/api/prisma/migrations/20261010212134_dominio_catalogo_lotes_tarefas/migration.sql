-- CreateEnum
CREATE TYPE "TipoTarefa" AS ENUM ('VALIDADE', 'REPOSICAO', 'RUPTURA', 'CONTAGEM', 'AUDITORIA_PRECO', 'MANUAL');

-- CreateEnum
CREATE TYPE "StatusTarefa" AS ENUM ('GERADA', 'ACEITA', 'EM_EXECUCAO', 'CONCLUIDA', 'CANCELADA', 'IMPEDIDA', 'OBSOLETA');

-- CreateEnum
CREATE TYPE "OrigemTarefa" AS ENUM ('AUTOMATICA', 'MANUAL');

-- CreateEnum
CREATE TYPE "UnidadeMedida" AS ENUM ('UN', 'KG');

-- CreateTable
CREATE TABLE "categorias" (
    "id" UUID NOT NULL,
    "codigo_erp" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "pai_id" UUID,
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL,
    "excluido_em" TIMESTAMPTZ(3),

    CONSTRAINT "categorias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "produtos" (
    "id" UUID NOT NULL,
    "codigo_erp" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "categoria_id" UUID NOT NULL,
    "unidade" "UnidadeMedida" NOT NULL DEFAULT 'UN',
    "controla_lote" BOOLEAN NOT NULL DEFAULT true,
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL,
    "excluido_em" TIMESTAMPTZ(3),

    CONSTRAINT "produtos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "eans" (
    "id" UUID NOT NULL,
    "codigo" TEXT NOT NULL,
    "produto_id" UUID NOT NULL,
    "quantidade_embalagem" INTEGER NOT NULL DEFAULT 1,
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL,
    "excluido_em" TIMESTAMPTZ(3),

    CONSTRAINT "eans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "produtos_lojas" (
    "produto_id" UUID NOT NULL,
    "loja_id" UUID NOT NULL,
    "preco" DECIMAL(12,2) NOT NULL,
    "saldo" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "endereco" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "produtos_lojas_pkey" PRIMARY KEY ("produto_id","loja_id")
);

-- CreateTable
CREATE TABLE "lotes" (
    "id" UUID NOT NULL,
    "produto_id" UUID NOT NULL,
    "loja_id" UUID NOT NULL,
    "codigo" TEXT NOT NULL DEFAULT '',
    "validade" DATE NOT NULL,
    "quantidade_estimada" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL,
    "excluido_em" TIMESTAMPTZ(3),

    CONSTRAINT "lotes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tarefas" (
    "id" UUID NOT NULL,
    "loja_id" UUID NOT NULL,
    "tipo" "TipoTarefa" NOT NULL,
    "status" "StatusTarefa" NOT NULL DEFAULT 'GERADA',
    "origem" "OrigemTarefa" NOT NULL DEFAULT 'AUTOMATICA',
    "prioridade" INTEGER NOT NULL DEFAULT 0,
    "titulo" TEXT NOT NULL,
    "descricao" TEXT,
    "produto_id" UUID,
    "lote_id" UUID,
    "responsavel_id" UUID,
    "criado_por_id" UUID,
    "prazo" TIMESTAMPTZ(3),
    "dados" JSONB,
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "tarefas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tarefa_eventos" (
    "id" UUID NOT NULL,
    "tarefa_id" UUID NOT NULL,
    "status_anterior" "StatusTarefa",
    "status_novo" "StatusTarefa" NOT NULL,
    "usuario_id" UUID,
    "motivo" TEXT,
    "dispositivo_id" TEXT,
    "sequencia_dispositivo" INTEGER,
    "ocorrido_em" TIMESTAMPTZ(3) NOT NULL,
    "recebido_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dados" JSONB,

    CONSTRAINT "tarefa_eventos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "categorias_codigo_erp_key" ON "categorias"("codigo_erp");

-- CreateIndex
CREATE INDEX "categorias_atualizado_em_idx" ON "categorias"("atualizado_em");

-- CreateIndex
CREATE UNIQUE INDEX "produtos_codigo_erp_key" ON "produtos"("codigo_erp");

-- CreateIndex
CREATE INDEX "produtos_categoria_id_idx" ON "produtos"("categoria_id");

-- CreateIndex
CREATE INDEX "produtos_atualizado_em_idx" ON "produtos"("atualizado_em");

-- CreateIndex
CREATE UNIQUE INDEX "eans_codigo_key" ON "eans"("codigo");

-- CreateIndex
CREATE INDEX "eans_produto_id_idx" ON "eans"("produto_id");

-- CreateIndex
CREATE INDEX "eans_atualizado_em_idx" ON "eans"("atualizado_em");

-- CreateIndex
CREATE INDEX "produtos_lojas_loja_id_atualizado_em_idx" ON "produtos_lojas"("loja_id", "atualizado_em");

-- CreateIndex
CREATE INDEX "lotes_loja_id_validade_idx" ON "lotes"("loja_id", "validade");

-- CreateIndex
CREATE INDEX "lotes_loja_id_atualizado_em_idx" ON "lotes"("loja_id", "atualizado_em");

-- CreateIndex
CREATE UNIQUE INDEX "lotes_loja_id_produto_id_codigo_validade_key" ON "lotes"("loja_id", "produto_id", "codigo", "validade");

-- CreateIndex
CREATE INDEX "tarefas_loja_id_status_idx" ON "tarefas"("loja_id", "status");

-- CreateIndex
CREATE INDEX "tarefas_responsavel_id_status_idx" ON "tarefas"("responsavel_id", "status");

-- CreateIndex
CREATE INDEX "tarefas_loja_id_atualizado_em_idx" ON "tarefas"("loja_id", "atualizado_em");

-- CreateIndex
CREATE INDEX "tarefa_eventos_tarefa_id_ocorrido_em_idx" ON "tarefa_eventos"("tarefa_id", "ocorrido_em");

-- AddForeignKey
ALTER TABLE "categorias" ADD CONSTRAINT "categorias_pai_id_fkey" FOREIGN KEY ("pai_id") REFERENCES "categorias"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "produtos" ADD CONSTRAINT "produtos_categoria_id_fkey" FOREIGN KEY ("categoria_id") REFERENCES "categorias"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eans" ADD CONSTRAINT "eans_produto_id_fkey" FOREIGN KEY ("produto_id") REFERENCES "produtos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "produtos_lojas" ADD CONSTRAINT "produtos_lojas_produto_id_fkey" FOREIGN KEY ("produto_id") REFERENCES "produtos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "produtos_lojas" ADD CONSTRAINT "produtos_lojas_loja_id_fkey" FOREIGN KEY ("loja_id") REFERENCES "lojas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lotes" ADD CONSTRAINT "lotes_produto_id_fkey" FOREIGN KEY ("produto_id") REFERENCES "produtos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lotes" ADD CONSTRAINT "lotes_loja_id_fkey" FOREIGN KEY ("loja_id") REFERENCES "lojas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tarefas" ADD CONSTRAINT "tarefas_loja_id_fkey" FOREIGN KEY ("loja_id") REFERENCES "lojas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tarefas" ADD CONSTRAINT "tarefas_produto_id_fkey" FOREIGN KEY ("produto_id") REFERENCES "produtos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tarefas" ADD CONSTRAINT "tarefas_lote_id_fkey" FOREIGN KEY ("lote_id") REFERENCES "lotes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tarefas" ADD CONSTRAINT "tarefas_responsavel_id_fkey" FOREIGN KEY ("responsavel_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tarefas" ADD CONSTRAINT "tarefas_criado_por_id_fkey" FOREIGN KEY ("criado_por_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tarefa_eventos" ADD CONSTRAINT "tarefa_eventos_tarefa_id_fkey" FOREIGN KEY ("tarefa_id") REFERENCES "tarefas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tarefa_eventos" ADD CONSTRAINT "tarefa_eventos_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ─── Adicionado à mão: eventos de tarefa são imutáveis ────────────────────────
-- Mesmo que um bug na API (ou alguém com acesso ao banco) tente alterar ou apagar
-- um evento, o próprio PostgreSQL recusa. A auditoria não depende só do código.
CREATE FUNCTION impedir_alteracao_evento() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'tarefa_eventos é somente inserção: % não é permitido', TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tarefa_eventos_somente_insercao
  BEFORE UPDATE OR DELETE ON "tarefa_eventos"
  FOR EACH ROW EXECUTE FUNCTION impedir_alteracao_evento();