import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule, type SwaggerDocumentOptions } from '@nestjs/swagger';
import type { ZodType } from 'zod';
import { createSchema } from 'zod-openapi';

/** Confere se um schema veio do Zod (o Standard Schema informa a biblioteca de origem). */
function ehSchemaZod(schema: unknown): schema is ZodType {
  return (
    typeof schema === 'object' &&
    schema !== null &&
    (schema as { '~standard'?: { vendor?: string } })['~standard']?.vendor === 'zod'
  );
}

/** Documentação interativa da API em /api/docs (somente fora de produção). */
export function setupSwagger(app: INestApplication): void {
  const config = new DocumentBuilder()
    .setTitle('Meu Estoque API')
    .setDescription('Middleware do app de operações de loja')
    .setVersion('0.1.0')
    // Habilita o botão "Authorize" para colar o token de acesso
    .addBearerAuth()
    .build();

  const opcoes: SwaggerDocumentOptions = {
    // Converte os schemas Zod das rotas (@Body({ schema })) para a documentação
    standardSchemaConverter: (schema, { schemaType }) => {
      if (!ehSchemaZod(schema)) return undefined;
      const { schema: convertido, components } = createSchema(schema, {
        io: schemaType,
        openapiVersion: '3.0.0',
      });
      return { schema: convertido, components };
    },
  };

  const document = SwaggerModule.createDocument(app, config, opcoes);
  SwaggerModule.setup('api/docs', app, document, {
    // Mantém o token colado no "Authorize" ao recarregar a página
    swaggerOptions: { persistAuthorization: true },
  });
}
