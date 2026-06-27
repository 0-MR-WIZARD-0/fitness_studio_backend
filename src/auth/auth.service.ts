import { Injectable } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';

export interface SessionAdmin {
  id: number;
  username: string;
}

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}

  async validateAdmin(
    username: string,
    password: string,
  ): Promise<SessionAdmin | null> {
    const admin = await this.prisma.admin.findUnique({ where: { username } });
    if (!admin) return null;

    const ok = await bcrypt.compare(password, admin.passwordHash);
    if (!ok) return null;

    return { id: admin.id, username: admin.username };
  }
}
