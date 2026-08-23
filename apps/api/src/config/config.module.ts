import { Global, Module } from '@nestjs/common';
import { CONFIG, loadConfiguration } from './configuration';

/**
 * Глобальный модуль конфигурации. Значения читаются из окружения один раз
 * на старте: отсутствие обязательной переменной роняет процесс сразу.
 */
@Global()
@Module({
  providers: [{ provide: CONFIG, useFactory: loadConfiguration }],
  exports: [CONFIG],
})
export class AppConfigModule {}
