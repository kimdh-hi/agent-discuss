import { ArgumentMetadata, PipeTransform } from '@nestjs/common';
import { ZodSchema } from 'zod';
import { BaseException } from '../errors/base.exception';
import { ErrorCode } from '../errors/error-code';

class ZodValidationPipe<T> implements PipeTransform {
  constructor(private readonly schema: ZodSchema<T>) {}

  transform(value: unknown, _metadata: ArgumentMetadata): T {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new BaseException(
        ErrorCode.VALIDATION_FAILED,
        'Request validation failed',
        result.error.flatten(),
      );
    }
    return result.data;
  }
}

export function zodBody<T>(schema: ZodSchema<T>): ZodValidationPipe<T> {
  return new ZodValidationPipe(schema);
}
