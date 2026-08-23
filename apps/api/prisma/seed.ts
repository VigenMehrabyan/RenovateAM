/**
 * Сид: базовая ставка 60 000 AMD с коэффициентами из README и учётная
 * запись администратора из переменных окружения.
 *
 * Идемпотентен: повторный запуск не создаёт вторую активную версию ставок
 * и не дублирует админа.
 */
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcryptjs';
import { PrismaClient } from '../src/generated/prisma/client';
import { DEFAULT_RATE_VALUES } from '../src/modules/pricing/pricing.service';
import { loadEnvFile } from './load-env';

async function main(): Promise<void> {
  loadEnvFile();
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL не задан');

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

  try {
    // --- администратор -----------------------------------------------------
    const email = (process.env.SEED_ADMIN_EMAIL ?? 'admin@renovateam.am').toLowerCase();
    const password = process.env.SEED_ADMIN_PASSWORD;
    if (!password) throw new Error('SEED_ADMIN_PASSWORD не задан');

    const admin = await prisma.user.upsert({
      where: { email },
      update: { role: 'ADMIN' },
      create: {
        email,
        fullName: process.env.SEED_ADMIN_NAME ?? 'RenovateAM Admin',
        phone: process.env.SEED_ADMIN_PHONE ?? '+37410000000',
        address: 'Yerevan',
        passwordHash: await bcrypt.hash(password, 12),
        role: 'ADMIN',
        locale: 'RU',
        emailVerifiedAt: new Date(),
      },
    });
    console.warn(`админ: ${admin.email}`);

    // --- ставки ------------------------------------------------------------
    const active = await prisma.rateVersion.findFirst({ where: { isActive: true } });
    if (active) {
      console.warn(`активная версия ставок уже есть: ${active.id}`);
    } else {
      const version = await prisma.rateVersion.create({
        data: {
          createdById: admin.id,
          note: 'Начальный набор: база 60 000 AMD/м², коэффициенты из README',
          isActive: true,
          rates: {
            create: Object.entries(DEFAULT_RATE_VALUES).map(([key, value]) => ({ key, value })),
          },
        },
      });
      console.warn(`создана версия ставок ${version.id} (база 60 000 AMD)`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
