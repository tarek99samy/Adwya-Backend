import { UnauthorizedException, ForbiddenException, NotFoundException } from '@nestjs/common';

export class InvalidCredentialsException extends UnauthorizedException {
  constructor() {
    super('Invalid credentials');
  }
}

export class PendingResetPasswordException extends ForbiddenException {
  constructor() {
    super('Login blocked for user with pending-reset status. Please complete the reset process.');
  }
}

export class EmailAlreadyInUseException extends ForbiddenException {
  constructor() {
    super('Email already in use');
  }
}

export class UserNotFoundException extends NotFoundException {
  constructor() {
    super('User not found');
  }
}

export class InvalidSecurityAnswerException extends UnauthorizedException {
  constructor() {
    super('Invalid security answer');
  }
}
