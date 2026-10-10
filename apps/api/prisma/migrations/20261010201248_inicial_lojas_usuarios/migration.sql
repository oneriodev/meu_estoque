-- CreateEnum
CREATE TYPE "PapelUsuario" AS ENUM ('OPERADOR', 'SUPERVISOR', 'ADMINISTRADOR');

-- CreateTable
CREATE TABLE "lojas" (
    "id" UUID NOT NULL,
    "codigo" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "ativa" BOOLEAN NOT NULL DEFAULT true,
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "lojas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usuarios" (
    "id" UUID NOT NULL,
    "login" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "senha_hash" TEXT NOT NULL,
    "papel" "PapelUsuario" NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criado_em" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "usuarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usuarios_lojas" (
    "usuario_id" UUID NOT NULL,
    "loja_id" UUID NOT NULL,

    CONSTRAINT "usuarios_lojas_pkey" PRIMARY KEY ("usuario_id","loja_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "lojas_codigo_key" ON "lojas"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_login_key" ON "usuarios"("login");

-- CreateIndex
CREATE INDEX "usuarios_lojas_loja_id_idx" ON "usuarios_lojas"("loja_id");

-- AddForeignKey
ALTER TABLE "usuarios_lojas" ADD CONSTRAINT "usuarios_lojas_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usuarios_lojas" ADD CONSTRAINT "usuarios_lojas_loja_id_fkey" FOREIGN KEY ("loja_id") REFERENCES "lojas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
