import 'dotenv/config';
import * as bcrypt from 'bcrypt';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  const username = process.env.ADMIN_USERNAME ?? 'admin';
  const password = process.env.ADMIN_PASSWORD ?? 'admin123';

  const owner = await prisma.admin.findFirst({ where: { role: 'OWNER' } });
  if (!owner) {
    await prisma.admin.create({
      data: {
        username,
        passwordHash: await bcrypt.hash(password, 10),
        role: 'OWNER',
      },
    });
  } else if (process.env.ADMIN_RESET === '1') {
    await prisma.admin.update({
      where: { id: owner.id },
      data: { username, passwordHash: await bcrypt.hash(password, 10) },
    });
    console.log('Логин и пароль главного админа сброшены из окружения');
  }

  await prisma.siteSettings.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1 },
  });

  console.log(
    owner ? 'Главный админ уже есть' : `Главный админ "${username}" создан`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
