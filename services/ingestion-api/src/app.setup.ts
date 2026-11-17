import { INestApplication, RequestMethod, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

/** HTTP-level configuration shared by `main.ts` and the e2e tests. */
export function configureApp(app: INestApplication, { swagger = true } = {}): void {
  app.setGlobalPrefix('api/v1', {
    exclude: [{ path: 'health/(.*)', method: RequestMethod.GET }],
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.enableShutdownHooks();

  if (swagger) {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('Wayline Ingestion API')
        .setDescription('Ingests, stores and queries GPS telemetry from fleet devices.')
        .setVersion('1.0')
        .build(),
    );
    SwaggerModule.setup('docs', app, document);
  }
}
