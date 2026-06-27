import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-local';
import { AuthService, SessionAdmin } from './auth.service';

@Injectable()
export class LocalStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly authService: AuthService) {
    super({ usernameField: 'username', passwordField: 'password' });
  }

  async validate(username: string, password: string): Promise<SessionAdmin> {
    const admin = await this.authService.validateAdmin(username, password);
    if (!admin) {
      throw new UnauthorizedException('Неверный логин или пароль');
    }
    return admin;
  }
}
