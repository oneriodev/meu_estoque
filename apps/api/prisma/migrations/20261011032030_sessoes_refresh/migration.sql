-- CreateTable
CREATE TABLE "sessoes_refresh" (
    "id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "familia_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "dispositivo" TEXT,
    "expira_em" TIMESTAMPTZ(3) NOT NULL,
    "revogado_em" TIMESTAMPTZ(3),
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessoes_refresh_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sessoes_refresh_token_hash_key" ON "sessoes_refresh"("token_hash");

-- CreateIndex
CREATE INDEX "sessoes_refresh_usuario_id_idx" ON "sessoes_refresh"("usuario_id");

-- CreateIndex
CREATE INDEX "sessoes_refresh_familia_id_idx" ON "sessoes_refresh"("familia_id");

-- AddForeignKey
ALTER TABLE "sessoes_refresh" ADD CONSTRAINT "sessoes_refresh_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;
