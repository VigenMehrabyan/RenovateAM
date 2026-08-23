import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureApp } from './bootstrap';
import { CONFIG, type AppConfig } from './config/configuration';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: false });
  const config = app.get<AppConfig>(CONFIG);
  configureApp(app, config.appUrl);
  app.enableShutdownHooks();

  await app.listen(config.port);
  new Logger('bootstrap').log(`API слушает порт ${config.port} (${config.nodeEnv})`);
}

void bootstrap();
