import { CanActivate, ExecutionContext, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';

@Injectable()
export default class AuthGuard implements CanActivate {
  private readonly logger = new Logger(AuthGuard.name);
  constructor(private jwtService: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    this.logger.log(`Validating request for ${request.url}`);

    const token = this.extractTokenFromHeader(request) ?? this.extractTokenFromCookie(request);
    if (!token) {
      this.logger.warn('No token provided');
      throw new UnauthorizedException('No token provided');
    }
    this.logger.log(`Token found: ${token}, verifying...`);

    try {
      const payload: { email: string } = await this.jwtService.verifyAsync(token);
      request['email'] = payload['email'];
      this.logger.log(`Token validated for user: ${payload.email}`);
      return true;
    } catch {
      this.logger.warn('Invalid token');
      throw new UnauthorizedException('Invalid token');
    }
  }

  private extractTokenFromHeader(request: Request): string | undefined {
    const authHeader = request.headers.authorization;
    if (!authHeader) return undefined;

    const [type, token] = authHeader.split(' ');
    return type === 'Bearer' ? token : undefined;
  }

  private extractTokenFromCookie(request: Request): string | undefined {
    const [type, token] = request.cookies?.access_token?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }
}
