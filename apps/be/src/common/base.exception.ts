import { ErrorCode } from './error-code';

export class BaseException extends Error {
  constructor(
    readonly errorCode: ErrorCode,
    message?: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'BaseException';
  }
}
