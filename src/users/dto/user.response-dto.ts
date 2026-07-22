import { UserType } from '../../common/enums';

/**
 * Wire format for a user. Never expose `passwordHash` — even the hash should
 * stay server-side. Use a dedicated auth DTO if the client ever needs the
 * hash for some reason.
 */
export class UserResponseDto {
  id!: string;
  phone!: string;
  email?: string | null;
  fullName!: string;
  userType!: UserType;
  isActive!: boolean;
  createdAt!: Date;
  updatedAt!: Date;
}
