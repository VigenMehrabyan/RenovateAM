import { ValidationPipe, type INestApplication } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import { RequestIdMiddleware } from '@common/middleware/request-id.middleware';

/** Базовый URL всех эндпоинтов. */
export const API_PREFIX = 'api/v1';

/**
 * Общая настройка приложения: используется и боевым bootstrap, и тестами,
 * поэтому тесты бьют ровно по тому же конвейеру, что и продакшен.
 */
export function configureApp(app: INestApplication, corsOrigin?: string): INestApplication {
  const requestId = new RequestIdMiddleware();
  app.use(requestId.use.bind(requestId));
  app.use(cookieParser());
  app.setGlobalPrefix(API_PREFIX);
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );
  if (corsOrigin) {
    app.enableCors({ origin: corsOrigin, credentials: true });
  }
  return app;
}
