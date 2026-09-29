import { IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class ConnectManualAccountDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  waba_id!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(64)
  phone_number_id!: string;

  /** Display form, e.g. "+1 555 0100". Shown in the UI, never sent to Meta. */
  @IsString()
  @MinLength(1)
  @MaxLength(32)
  display_phone!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(512)
  access_token!: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  verified_name?: string;
}

/** Meta's GET handshake. The hub.* names are Meta's, not ours. */
export class VerifyWebhookQueryDto {
  @IsOptional()
  @IsString()
  @Matches(/^subscribe$/)
  'hub.mode'?: string;

  @IsOptional()
  @IsString()
  'hub.verify_token'?: string;

  @IsOptional()
  @IsString()
  'hub.challenge'?: string;
}
