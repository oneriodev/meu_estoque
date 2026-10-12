CREATE TABLE `tarefas` (
	`id` text PRIMARY KEY NOT NULL,
	`tipo` text NOT NULL,
	`status` text NOT NULL,
	`origem` text NOT NULL,
	`prioridade` integer NOT NULL,
	`titulo` text NOT NULL,
	`descricao` text,
	`produto_id` text,
	`lote_id` text,
	`responsavel_id` text,
	`responsavel_nome` text,
	`prazo` text,
	`criado_em` text NOT NULL,
	`atualizado_em` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `tarefas_status_idx` ON `tarefas` (`status`);--> statement-breakpoint
CREATE INDEX `tarefas_produto_idx` ON `tarefas` (`produto_id`);