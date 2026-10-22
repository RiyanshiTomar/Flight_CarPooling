import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { configureApp, loadEnv } from './setup';

async function bootstrap() {
  loadEnv();
  // AppModule is imported after env is loaded because modules read process.env at definition time
  const { AppModule } = await import('./app.module');
  const prod = process.env.NODE_ENV === 'production';
  const app = await NestFactory.create(AppModule, { logger: prod ? ['error', 'warn', 'log'] : undefined });
  configureApp(app);

  if (!prod || process.env.SWAGGER === 'true') {
    const docs = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().setTitle('FlyPool API').setVersion('2.0').addBearerAuth().build(),
    );
    SwaggerModule.setup('docs', app, docs);
  }

  const port = Number(process.env.PORT ?? 4000);
  await app.listen(port, '0.0.0.0');
  new Logger('Boot').log(`FlyPool API on :${port}${prod ? '' : `   docs: http://localhost:${port}/docs`}`);
}
bootstrap().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
