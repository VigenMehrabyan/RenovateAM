import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/**
 * Троттлинг HTTP-запросов. В тестовом окружении отключается: лимиты в памяти
 * процесса мешают детерминированным прогонам, а бизнес-троттлинг повторной
 * отправки письма живёт в БД и проверяется отдельно.
 */
@Injectable()
export class AppThrottlerGuard extends ThrottlerGuard {
  protected override async shouldSkip(): Promise<boolean> {
    return Promise.resolve(process.env.NODE_ENV === 'test');
  }
}
