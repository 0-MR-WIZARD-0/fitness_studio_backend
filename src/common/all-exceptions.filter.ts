import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exceptions');

  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | string[] = 'Внутренняя ошибка сервера';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const r = exception.getResponse();
      message =
        typeof r === 'string'
          ? r
          : ((r as { message?: string | string[] }).message ?? message);
    } else if (this.isPrismaError(exception)) {
      const mapped = this.mapPrisma(exception.code);
      status = mapped.status;
      message = mapped.message;
    } else if (this.isMulterError(exception)) {
      status = HttpStatus.BAD_REQUEST;
      message = this.mapMulter(exception.code);
    }

    if (status >= 500) {
      this.logger.error(exception instanceof Error ? exception.stack : exception);
    }

    res.status(status).json({ statusCode: status, message });
  }

  private isPrismaError(e: unknown): e is { code: string } {
    return (
      typeof e === 'object' &&
      e !== null &&
      typeof (e as { code?: unknown }).code === 'string' &&
      /^P\d{4}$/.test((e as { code: string }).code)
    );
  }

  private mapPrisma(code: string): { status: number; message: string } {
    switch (code) {
      case 'P2002':
        return {
          status: HttpStatus.CONFLICT,
          message: 'Запись с такими данными уже существует',
        };
      case 'P2025':
        return { status: HttpStatus.NOT_FOUND, message: 'Запись не найдена' };
      case 'P2003':
        return {
          status: HttpStatus.BAD_REQUEST,
          message: 'Связанная запись не найдена',
        };
      case 'P2000':
        return {
          status: HttpStatus.BAD_REQUEST,
          message: 'Значение слишком длинное для поля',
        };
      default:
        return {
          status: HttpStatus.BAD_REQUEST,
          message: 'Ошибка базы данных',
        };
    }
  }

  private isMulterError(e: unknown): e is { code: string } {
    return (
      typeof e === 'object' &&
      e !== null &&
      (e as { name?: unknown }).name === 'MulterError'
    );
  }

  private mapMulter(code: string): string {
    switch (code) {
      case 'LIMIT_FILE_SIZE':
        return 'Файл слишком большой (максимум 100 МБ)';
      case 'LIMIT_UNEXPECTED_FILE':
        return 'Неподдерживаемый файл';
      default:
        return 'Не удалось загрузить файл';
    }
  }
}
