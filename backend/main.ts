import 'reflect-metadata';
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';

async function bootstrap() {
  const app = configureApp(await NestFactory.create(AppModule, { bodyParser: false }));
  const port = Number(process.env.API_PORT || 3001);
  await app.listen(port, '0.0.0.0');
  console.log(`EduAssess API: http://localhost:${port}/api`);
}

void bootstrap();
