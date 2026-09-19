import { Injectable } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';

export type AdminRole = 'OWNER' | 'TRAINER';

export interface SessionAdmin {
  id: number;
  username: string;
  role: AdminRole;
  trainerId: number | null;
}

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}

  private toSession(admin: {
    id: number;
    username: string;
    role: AdminRole;
    trainerId: number | null;
  }): SessionAdmin {
    return {
      id: admin.id,
      username: admin.username,
      role: admin.role,
      trainerId: admin.trainerId,
    };
  }

  async validateAdmin(
    username: string,
    password: string,
  ): Promise<SessionAdmin | null> {
    const admin = await this.prisma.admin.findUnique({ where: { username } });
    if (!admin) return null;

    const ok = await bcrypt.compare(password, admin.passwordHash);
    if (!ok) return null;

    return this.toSession(admin);
  }

  async checkPassword(adminId: number, password: string): Promise<boolean> {
    const admin = await this.prisma.admin.findUnique({
      where: { id: adminId },
    });
    if (!admin || !password) return false;
    return bcrypt.compare(password, admin.passwordHash);
  }

  async findSession(id: number): Promise<SessionAdmin | null> {
    const admin = await this.prisma.admin.findUnique({ where: { id } });
    return admin ? this.toSession(admin) : null;
  }
}
