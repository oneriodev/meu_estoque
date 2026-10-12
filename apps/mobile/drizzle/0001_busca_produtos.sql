ALTER TABLE `produtos` ADD `descricao_busca` text DEFAULT '' NOT NULL;--> statement-breakpoint
CREATE INDEX `produtos_codigo_erp_idx` ON `produtos` (`codigo_erp`);

--> statement-breakpoint
-- Migração de DADOS (acrescentada à mão): os produtos já baixados estão com descricao_busca vazia.
-- Apagar o cursor faz a próxima sincronização baixar o catálogo de novo e preencher a coluna.
DELETE FROM `estado_sincronizacao` WHERE `chave` = 'cursor';