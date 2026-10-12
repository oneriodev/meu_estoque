-- CreateEnum
CREATE TYPE "ResultadoEvento" AS ENUM ('APLICADO', 'REJEITADO');

-- AlterTable
ALTER TABLE "sessoes_refresh" ADD COLUMN     "substituido_em" TIMESTAMPTZ(3);

-- CreateTable
CREATE TABLE "eventos_recebidos" (
    "id" UUID NOT NULL,
    "tipo" TEXT NOT NULL,
    "loja_id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "ocorrido_em" TIMESTAMPTZ(3) NOT NULL,
    "recebido_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resultado" "ResultadoEvento" NOT NULL,
    "motivo" TEXT,
    "dados" JSONB,

    CONSTRAINT "eventos_recebidos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "eventos_recebidos_loja_id_recebido_em_idx" ON "eventos_recebidos"("loja_id", "recebido_em");

-- CreateIndex
CREATE INDEX "eventos_recebidos_usuario_id_idx" ON "eventos_recebidos"("usuario_id");

-- AddForeignKey
ALTER TABLE "eventos_recebidos" ADD CONSTRAINT "eventos_recebidos_loja_id_fkey" FOREIGN KEY ("loja_id") REFERENCES "lojas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eventos_recebidos" ADD CONSTRAINT "eventos_recebidos_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
