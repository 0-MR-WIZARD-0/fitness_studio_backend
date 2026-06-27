import { Injectable } from '@nestjs/common';
import { PassportSerializer } from '@nestjs/passport';
import { SessionAdmin } from './auth.service';

@Injectable()
export class SessionSerializer extends PassportSerializer {
  serializeUser(
    user: SessionAdmin,
    done: (err: Error | null, payload: SessionAdmin) => void,
  ): void {
    done(null, user);
  }

  deserializeUser(
    payload: SessionAdmin,
    done: (err: Error | null, user: SessionAdmin) => void,
  ): void {
    done(null, payload);
  }
}
