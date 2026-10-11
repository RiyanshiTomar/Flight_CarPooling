import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { configureApp, loadEnv } from './setup';

async function bootstrap() {
  loadEnv();
  // AppModule is imported after env is loaded because modules read process.env at definition time
  const { AppModule } = await import('./app.module');
  const app = await NestFactory.create(AppModule);
  configureApp(app);

  const docs = SwaggerModule.createDocument(
    app,
    new DocumentBuilder().setTitle('FlyPool API').setVersion('0.1').addBearerAuth().build(),
  );
  SwaggerModule.setup('docs', app, docs);

  const port = Number(process.env.PORT ?? 4000);
  await app.listen(port);
  console.log(`FlyPool API  http://localhost:${port}   docs: http://localhost:${port}/docs`);
}
bootstrap();
