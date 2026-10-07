import { BadRequestException, Injectable, type PipeTransform } from '@nestjs/common';
import type { ZodType } from 'zod';
import { ERROR_CODES } from '@crm/shared';

/**
 * Validates a parameter against a zod schema from @crm/shared.
 *
 * For bodies that class-validator cannot express, such as the discriminated
 * union of POST /conversations/:id/messages. The global ValidationPipe skips a
 * parameter typed as a plain type alias, so the two never fight over one body.
 * Failures use the same VALIDATION_FAILED shape the ValidationPipe produces.
 */
@Injectable()
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodType<T>) {}

  transform(value: unknown): T {
    const parsed = this.schema.safeParse(value);

    if (!parsed.success) {
      throw new BadRequestException({
        code: ERROR_CODES.VALIDATION_FAILED,
        message: 'Request validation failed',
        details: {
          issues: parsed.error.issues.map((issue) => ({
            path: issue.path.join('.'),
            message: issue.message,
          })),
        },
      });
    }

    return parsed.data;
  }
}
