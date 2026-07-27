import { CanActivate, ExecutionContext, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';

@Injectable()
export default class CsrfGuard implements CanActivate {
  private readonly logger = new Logger(CsrfGuard.name);

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();

    if (!this.validateCsrfToken(request)) {
      throw new UnauthorizedException('Invalid CSRF token, please refresh the page and try again.');
    }

    return true;
  }

  private validateCsrfToken(request: Request): boolean {
    this.logger.log(`Validating CSRF token for request to ${request.url}`);
    const csrfCookie = request.cookies?.csrf_token as string | undefined;
    const csrfHeader = request.headers['x-csrf-token'] as string | undefined;

    if (!csrfCookie || !csrfHeader) {
      if (!csrfCookie) {
        this.logger.warn(`No cookie CSRF token provided`);
      }
      if (!csrfHeader) {
        this.logger.warn(`No header CSRF token provided`);
      }
      return false;
    }

    this.logger.log(`Found two tokens: ${csrfCookie} - ${csrfHeader}`);
    return csrfCookie === csrfHeader;
  }
}
