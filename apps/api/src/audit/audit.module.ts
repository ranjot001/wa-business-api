import { Global, Module } from '@nestjs/common';
import { AuditRepository } from './audit.repository';

/**
 * Global because every future module writes audit entries and none of them
 * should have to remember to import this.
 */
@Global()
@Module({
  providers: [AuditRepository],
  exports: [AuditRepository],
})
export class AuditModule {}
