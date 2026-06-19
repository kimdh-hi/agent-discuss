import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';
import { BaseException } from './base.exception';
import { ErrorCode, UNAUTHORIZED_CODES } from './error-code';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();

    if (exception instanceof BaseException) {
      const status = UNAUTHORIZED_CODES.has(exception.errorCode) ? 401 : 400;
      res.status(status).json({
        errorCode: exception.errorCode,
        message: exception.message || null,
        details: exception.details,
      });
      return;
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      res.status(status).json({
        errorCode: status === 401 ? ErrorCode.UNAUTHORIZED : ErrorCode.VALIDATION_FAILED,
        message: exception.message || null,
      });
      return;
    }

    this.logger.error(exception);
    res.status(500).json({ errorCode: ErrorCode.INTERNAL, message: null });
  }
}
