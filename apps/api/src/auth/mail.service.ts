import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';
import type { Env } from '../config/env';

/**
 * Transactional email.
 *
 * Without RESEND_API_KEY the message is logged instead of sent, which is what
 * local development and CI run on. Nothing else in the app should care which
 * of the two happened.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly resend: Resend | null;

  constructor(private readonly config: ConfigService<Env, true>) {
    const apiKey = this.config.get('RESEND_API_KEY', { infer: true });
    this.resend = apiKey ? new Resend(apiKey) : null;
  }

  async sendPasswordReset(email: string, token: string): Promise<void> {
    const url = `${this.config.get('APP_URL', { infer: true })}/reset-password?token=${encodeURIComponent(token)}`;
    await this.send(
      email,
      'Reset your password',
      `Use this link within the hour to set a new password: ${url}`,
    );
  }

  async sendInvitation(email: string, workspaceName: string, token: string): Promise<void> {
    const url = `${this.config.get('APP_URL', { infer: true })}/invite/${encodeURIComponent(token)}`;
    await this.send(
      email,
      `You have been invited to ${workspaceName}`,
      `Join ${workspaceName} here: ${url}`,
    );
  }

  private async send(to: string, subject: string, text: string): Promise<void> {
    if (!this.resend) {
      this.logger.log({ to, subject, text }, 'email not sent, no RESEND_API_KEY');
      return;
    }

    const from = this.config.get('MAIL_FROM', { infer: true });
    const { error } = await this.resend.emails.send({ from, to, subject, text });

    if (error) {
      // A failed email must not fail the request that triggered it: the token
      // is already valid and the user can ask for another one.
      this.logger.error({ to, subject, err: error }, 'failed to send email');
    }
  }
}
