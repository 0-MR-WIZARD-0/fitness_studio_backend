import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import {
  BadRequestException,
  ValidationError,
  ValidationPipe,
} from '@nestjs/common';
import session from 'express-session';
import passport from 'passport';
import connectPgSimple from 'connect-pg-simple';
import { Pool } from 'pg';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/all-exceptions.filter';

function flattenValidation(errors: ValidationError[]): string {
  const out: string[] = [];
  const walk = (errs: ValidationError[]) => {
    for (const e of errs) {
      if (e.constraints) out.push(...Object.values(e.constraints));
      if (e.children?.length) walk(e.children);
    }
  };
  walk(errors);
  const ru = out.filter((m) => /[а-яА-Я]/.test(m));
  if (ru.length) return ru.join(', ');
  return out.length
    ? 'Проверьте правильность заполнения полей'
    : 'Некорректные данные';
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.enableCors({
    origin: process.env.FRONTEND_URL ?? 'http://localhost:3000',
    credentials: true,
  });

  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      exceptionFactory: (errors) =>
        new BadRequestException(flattenValidation(errors)),
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());

  const PgSession = connectPgSimple(session);
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  app.use(
    session({
      store: new PgSession({
        pool,
        tableName: 'session',
        createTableIfMissing: true,
      }),
      secret: process.env.SESSION_SECRET ?? 'dev-secret',
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        maxAge: 1000 * 60 * 60 * 24 * 7,
      },
    }),
  );
  app.use(passport.initialize());
  app.use(passport.session());

  const port = Number(process.env.PORT ?? 4000);
  await app.listen(port);
  console.log(`Backend запущен на http://localhost:${port}/api`);
}
void bootstrap();
