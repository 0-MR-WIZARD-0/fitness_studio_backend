import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { Request } from 'express';
import type { SessionAdmin } from './auth.service';

@Injectable()
export class LocalAuthGuard extends AuthGuard('local') {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const result = (await super.canActivate(context)) as boolean;
    const request = context.switchToHttp().getRequest<Request>();
    await super.logIn(request);
    return result;
  }

  handleRequest<TUser>(err: unknown, user: TUser): TUser {
    if (err instanceof Error) throw err;
    if (!user) throw new UnauthorizedException('Неверный логин или пароль');
    return user;
  }
}

const TRAINER_ALLOWED = 'trainerAllowed';

export const TrainerAllowed = () => SetMetadata(TRAINER_ALLOWED, true);

@Injectable()
export class AuthenticatedGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    if (!request.isAuthenticated?.()) {
      throw new UnauthorizedException('Требуется вход в админку');
    }
    const admin = request.user as SessionAdmin;
    if (admin.role === 'OWNER') return true;

    const open = this.reflector.getAllAndOverride<boolean>(TRAINER_ALLOWED, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (open) return true;
    throw new ForbiddenException(
      'Этот раздел доступен только главному администратору',
    );
  }
}

export function currentAdmin(req: Request): SessionAdmin {
  return req.user as SessionAdmin;
}

export function assertOwnItem(
  admin: SessionAdmin,
  item: { createdById: number | null },
  what: string,
) {
  if (admin.role === 'OWNER') return;
  if (item.createdById !== admin.id) {
    throw new ForbiddenException(`Можно менять только свои ${what}`);
  }
}
