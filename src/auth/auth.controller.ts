import {
  Controller,
  Get,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { AuthenticatedGuard, LocalAuthGuard, TrainerAllowed } from './guards';
import { RateLimit } from '../common/rate-limit.guard';
import { SessionAdmin } from './auth.service';

@Controller('auth')
export class AuthController {
  @UseGuards(
    RateLimit(10, 5 * 60_000, 'Слишком много попыток входа'),
    LocalAuthGuard,
  )
  @Post('login')
  login(@Req() req: Request): { user: SessionAdmin } {
    return { user: req.user as SessionAdmin };
  }

  @UseGuards(AuthenticatedGuard)
  @TrainerAllowed()
  @Get('me')
  me(@Req() req: Request): { user: SessionAdmin } {
    return { user: req.user as SessionAdmin };
  }

  @Post('logout')
  logout(@Req() req: Request): Promise<{ ok: true }> {
    return new Promise((resolve, reject) => {
      req.logOut((err) => {
        if (err) return reject(new UnauthorizedException('Не удалось выйти'));
        req.session.destroy(() => resolve({ ok: true }));
      });
    });
  }
}
