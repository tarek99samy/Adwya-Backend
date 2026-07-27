import { ExceptionFilter, Catch, ArgumentsHost, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class GlobalHttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('HTTP');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const req = ctx.getRequest<Request>();
    const res = ctx.getResponse<Response>();

    const isHttpException = exception instanceof HttpException;
    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let response: string | object = { message: 'Internal server error' };

    if (isHttpException) {
      status = exception.getStatus();
      response = exception.getResponse();
    }
    this.logger.error(`${req.method} ${req.url}`, isHttpException ? null : (exception as Error).stack);

    res.status(status).json({
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: req.url,
      error: response,
    });
  }
}
