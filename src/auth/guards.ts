import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Request } from 'express';

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

@Injectable()
export class AuthenticatedGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    if (request.isAuthenticated && request.isAuthenticated()) {
      return true;
    }
    throw new UnauthorizedException('Требуется вход в админку');
  }
}
