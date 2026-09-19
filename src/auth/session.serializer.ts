import { Injectable } from '@nestjs/common';
import { PassportSerializer } from '@nestjs/passport';
import { AuthService, SessionAdmin } from './auth.service';

@Injectable()
export class SessionSerializer extends PassportSerializer {
  constructor(private readonly auth: AuthService) {
    super();
  }

  serializeUser(
    user: SessionAdmin,
    done: (err: Error | null, payload: number) => void,
  ): void {
    done(null, user.id);
  }

  deserializeUser(
    payload: number | { id?: number },
    done: (err: Error | null, user: SessionAdmin | false) => void,
  ): void {
    const id = typeof payload === 'number' ? payload : payload?.id;
    if (!id) return done(null, false);
    this.auth
      .findSession(id)
      .then((admin) => done(null, admin ?? false))
      .catch((err: Error) => done(err, false));
  }
}
