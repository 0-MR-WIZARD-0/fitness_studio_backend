import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  mixin,
  type Type,
} from '@nestjs/common';
import type { Request } from 'express';

type Hit = { count: number; resetAt: number };

export function RateLimit(
  limit: number,
  windowMs: number,
  message = 'Слишком много попыток, попробуйте позже',
): Type<CanActivate> {
  const hits = new Map<string, Hit>();

  @Injectable()
  class RateLimitGuardMixin implements CanActivate {
    canActivate(context: ExecutionContext): boolean {
      const req = context.switchToHttp().getRequest<Request>();
      const key = req.ip ?? req.socket.remoteAddress ?? 'unknown';
      const now = Date.now();

      const hit = hits.get(key);
      if (!hit || hit.resetAt <= now) {
        hits.set(key, { count: 1, resetAt: now + windowMs });
        if (hits.size > 5000) this.cleanup(now);
        return true;
      }

      hit.count += 1;
      if (hit.count > limit) {
        const left = Math.ceil((hit.resetAt - now) / 60000);
        throw new HttpException(
          `${message}${left > 0 ? ` — через ${left} мин` : ''}`,
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
      return true;
    }

    private cleanup(now: number) {
      for (const [key, value] of hits)
        if (value.resetAt <= now) hits.delete(key);
    }
  }

  return mixin(RateLimitGuardMixin);
}
