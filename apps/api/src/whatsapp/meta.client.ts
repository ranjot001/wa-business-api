import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MetaClient } from '@crm/shared';
import type { Env } from '../config/env';

/**
 * The api's entry point for outbound Meta calls.
 *
 * CLAUDE.md: every outbound Meta call goes through this file or the worker
 * equivalent, and nothing else in the api may fetch graph.facebook.com. The
 * transport lives in @crm/shared so the worker shares it; this class only
 * supplies configuration and logging.
 */
@Injectable()
export class MetaClientFactory {
  private readonly logger = new Logger(MetaClientFactory.name);

  constructor(private readonly config: ConfigService<Env, true>) {}

  /** A client bound to one account's access token. */
  forToken(accessToken: string): MetaClient {
    return new MetaClient({
      accessToken,
      version: this.config.get('META_GRAPH_VERSION', { infer: true }),
      onLog: (fields, message) => {
        this.logger.error(fields, message);
      },
    });
  }
}
