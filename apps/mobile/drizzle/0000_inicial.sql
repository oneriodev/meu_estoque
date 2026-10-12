CREATE TABLE `categorias` (
	`id` text PRIMARY KEY NOT NULL,
	`codigo_erp` text NOT NULL,
	`nome` text NOT NULL,
	`pai_id` text
);
--> statement-breakpoint
CREATE TABLE `eans` (
	`id` text PRIMARY KEY NOT NULL,
	`codigo` text NOT NULL,
	`produto_id` text NOT NULL,
	`quantidade_embalagem` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `eans_codigo_idx` ON `eans` (`codigo`);--> statement-breakpoint
CREATE INDEX `eans_produto_idx` ON `eans` (`produto_id`);--> statement-breakpoint
CREATE TABLE `estado_sincronizacao` (
	`chave` text PRIMARY KEY NOT NULL,
	`valor` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `lotes` (
	`id` text PRIMARY KEY NOT NULL,
	`produto_id` text NOT NULL,
	`codigo` text NOT NULL,
	`validade` text NOT NULL,
	`quantidade_estimada` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `lotes_produto_idx` ON `lotes` (`produto_id`);--> statement-breakpoint
CREATE INDEX `lotes_validade_idx` ON `lotes` (`validade`);--> statement-breakpoint
CREATE TABLE `outbox` (
	`id` text PRIMARY KEY NOT NULL,
	`loja_id` text NOT NULL,
	`usuario_id` text NOT NULL,
	`tipo` text NOT NULL,
	`dados` text NOT NULL,
	`ocorrido_em` text NOT NULL,
	`sequencia` integer NOT NULL,
	`situacao` text DEFAULT 'PENDENTE' NOT NULL,
	`tentativas` integer DEFAULT 0 NOT NULL,
	`proxima_tentativa_em` integer DEFAULT 0 NOT NULL,
	`ultimo_erro` text
);
--> statement-breakpoint
CREATE INDEX `outbox_fila_idx` ON `outbox` (`situacao`,`sequencia`);--> statement-breakpoint
CREATE TABLE `produtos` (
	`id` text PRIMARY KEY NOT NULL,
	`codigo_erp` text NOT NULL,
	`descricao` text NOT NULL,
	`categoria_id` text NOT NULL,
	`unidade` text NOT NULL,
	`controla_lote` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `produtos_descricao_idx` ON `produtos` (`descricao`);--> statement-breakpoint
CREATE TABLE `produtos_loja` (
	`produto_id` text PRIMARY KEY NOT NULL,
	`preco` text NOT NULL,
	`saldo` text NOT NULL,
	`endereco` text
);