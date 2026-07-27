import { NotFoundException, BadRequestException } from '@nestjs/common';

export class UserFetchException extends NotFoundException {
  constructor() {
    super('User not found');
  }
}

export class CreateUserException extends BadRequestException {
  constructor() {
    super('Error creating new user');
  }
}
