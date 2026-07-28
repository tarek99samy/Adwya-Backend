import { Injectable } from '@nestjs/common';
import { Prisma, User, UserType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  EmailAlreadyInUseException,
  PhoneAlreadyInUseException,
} from '../common/exceptions/auth.exceptions';

export interface CreateUserInput {
  phone: string;
  email?: string;
  passwordHash?: string;
  fullName: string;
  userType?: UserType;
  isActive?: boolean;
}

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findById(
    id: string,
    opts?: { includeProfiles?: boolean },
  ): Promise<User | null> {
    return this.prisma.user.findUnique({
      where: { id },
      include: opts?.includeProfiles
        ? {
            profiles: {
              include: {
                profile: {
                  include: { permissions: { include: { permission: true } } },
                },
              },
            },
            permissions: { include: { permission: true } },
          }
        : undefined,
    });
  }

  async findByPhone(phone: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { phone } });
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { email } });
  }

  async create(input: CreateUserInput): Promise<User> {
    try {
      return await this.prisma.user.create({
        data: {
          phone: input.phone,
          email: input.email ?? null,
          passwordHash: input.passwordHash ?? null,
          fullName: input.fullName,
          userType: input.userType ?? UserType.CUSTOMER,
          isActive: input.isActive ?? true,
        },
      });
    } catch (err) {
      throw this.translateUniqueViolation(err);
    }
  }

  async updatePassword(userId: string, passwordHash: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash },
    });
  }

  /**
   * Effective permissions for a user, with deny-wins semantics:
   *   1. Start with all permission codes from the user's profiles.
   *   2. Apply UserPermission.granted = true  → add to set.
   *   3. Apply UserPermission.granted = false → remove from set.
   * The order in (2)+(3) doesn't matter because deny-wins is applied LAST
   * regardless. Roadmap §1.4 locks this down explicitly.
   */
  async loadPermissions(userId: string): Promise<Set<string>> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        profiles: {
          select: {
            profile: {
              select: {
                permissions: { select: { permission: { select: { code: true } } } },
              },
            },
          },
        },
        permissions: {
          select: { granted: true, permission: { select: { code: true } } },
        },
      },
    });

    const codes = new Set<string>();
    if (!user) return codes;

    for (const up of user.profiles) {
      for (const pp of up.profile.permissions) {
        codes.add(pp.permission.code);
      }
    }
    for (const override of user.permissions) {
      const code = override.permission.code;
      if (override.granted) codes.add(code);
      else codes.delete(code);
    }
    return codes;
  }

  private translateUniqueViolation(err: unknown): Error {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === 'P2002'
    ) {
      const target = (err.meta?.['target'] as string[] | undefined) ?? [];
      if (target.includes('phone')) return new PhoneAlreadyInUseException();
      if (target.includes('email')) return new EmailAlreadyInUseException();
    }
    throw err instanceof Error ? err : new Error(String(err));
  }
}
