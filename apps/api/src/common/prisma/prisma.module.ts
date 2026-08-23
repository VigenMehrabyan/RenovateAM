import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

/** Глобальный доступ к PrismaService — инжектится только в репозитории. */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
