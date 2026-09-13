import { BadRequestException, ParseIntPipe } from '@nestjs/common';

export const IdPipe = new ParseIntPipe({
  exceptionFactory: () => new BadRequestException('Некорректный идентификатор'),
});
