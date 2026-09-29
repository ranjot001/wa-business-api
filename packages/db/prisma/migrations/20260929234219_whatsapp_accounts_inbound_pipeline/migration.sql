-- CreateEnum
CREATE TYPE "whatsapp_account_status" AS ENUM ('connected', 'disconnected', 'error');

-- CreateEnum
CREATE TYPE "contact_source" AS ENUM ('inbound', 'import', 'manual', 'api');

-- CreateEnum
CREATE TYPE "conversation_status" AS ENUM ('open', 'pending', 'resolved');

-- CreateEnum
CREATE TYPE "message_direction" AS ENUM ('inbound', 'outbound');

-- CreateEnum
CREATE TYPE "message_type" AS ENUM ('text', 'image', 'video', 'audio', 'document', 'sticker', 'location', 'contacts', 'template', 'interactive', 'reaction', 'button', 'unsupported');

-- CreateEnum
CREATE TYPE "message_status" AS ENUM ('queued', 'sent', 'delivered', 'read', 'failed');

-- CreateEnum
CREATE TYPE "media_status" AS ENUM ('pending', 'ready', 'failed');

-- CreateEnum
CREATE TYPE "webhook_provider" AS ENUM ('meta', 'stripe');

-- CreateEnum
CREATE TYPE "webhook_event_status" AS ENUM ('received', 'processed', 'failed');

-- CreateTable
CREATE TABLE "whatsapp_accounts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" UUID NOT NULL,
    "waba_id" TEXT NOT NULL,
    "phone_number_id" TEXT NOT NULL,
    "display_phone" TEXT NOT NULL,
    "verified_name" TEXT,
    "access_token_enc" BYTEA NOT NULL,
    "quality_rating" TEXT,
    "messaging_tier" TEXT,
    "status" "whatsapp_account_status" NOT NULL DEFAULT 'connected',
    "connected_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "whatsapp_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contacts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" UUID NOT NULL,
    "wa_id" TEXT NOT NULL,
    "name" TEXT,
    "profile_name" TEXT,
    "attributes" JSONB NOT NULL DEFAULT '{}',
    "opted_out" BOOLEAN NOT NULL DEFAULT false,
    "opted_out_at" TIMESTAMPTZ(6),
    "last_inbound_at" TIMESTAMPTZ(6),
    "last_outbound_at" TIMESTAMPTZ(6),
    "source" "contact_source" NOT NULL DEFAULT 'inbound',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" UUID NOT NULL,
    "contact_id" UUID NOT NULL,
    "whatsapp_account_id" UUID NOT NULL,
    "status" "conversation_status" NOT NULL DEFAULT 'open',
    "assigned_to" UUID,
    "last_message_at" TIMESTAMPTZ(6),
    "last_message_preview" TEXT,
    "unread_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "contact_id" UUID NOT NULL,
    "direction" "message_direction" NOT NULL,
    "wa_message_id" TEXT,
    "type" "message_type" NOT NULL,
    "content" JSONB NOT NULL,
    "status" "message_status" NOT NULL DEFAULT 'queued',
    "error_code" INTEGER,
    "error_message" TEXT,
    "sent_by_user_id" UUID,
    "sent_by_automation_id" UUID,
    "broadcast_id" UUID,
    "reply_to_message_id" UUID,
    "wa_timestamp" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "media" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" UUID NOT NULL,
    "message_id" UUID NOT NULL,
    "wa_media_id" TEXT NOT NULL,
    "mime_type" TEXT,
    "size_bytes" INTEGER,
    "storage_key" TEXT,
    "status" "media_status" NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "media_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "provider" "webhook_provider" NOT NULL,
    "external_id" TEXT,
    "payload" JSONB NOT NULL,
    "status" "webhook_event_status" NOT NULL DEFAULT 'received',
    "error" TEXT,
    "processed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_accounts_phone_number_id_key" ON "whatsapp_accounts"("phone_number_id");

-- CreateIndex
CREATE INDEX "whatsapp_accounts_workspace_id_idx" ON "whatsapp_accounts"("workspace_id");

-- CreateIndex
CREATE INDEX "contacts_workspace_id_last_inbound_at_idx" ON "contacts"("workspace_id", "last_inbound_at");

-- CreateIndex
CREATE UNIQUE INDEX "contacts_workspace_id_wa_id_key" ON "contacts"("workspace_id", "wa_id");

-- CreateIndex
CREATE INDEX "conversations_workspace_id_status_last_message_at_idx" ON "conversations"("workspace_id", "status", "last_message_at" DESC);

-- CreateIndex
CREATE INDEX "conversations_workspace_id_assigned_to_status_idx" ON "conversations"("workspace_id", "assigned_to", "status");

-- CreateIndex
CREATE UNIQUE INDEX "conversations_workspace_id_contact_id_whatsapp_account_id_key" ON "conversations"("workspace_id", "contact_id", "whatsapp_account_id");

-- CreateIndex
CREATE UNIQUE INDEX "messages_wa_message_id_key" ON "messages"("wa_message_id");

-- CreateIndex
CREATE INDEX "messages_conversation_id_created_at_idx" ON "messages"("conversation_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "messages_workspace_id_idx" ON "messages"("workspace_id");

-- CreateIndex
CREATE INDEX "media_workspace_id_idx" ON "media"("workspace_id");

-- CreateIndex
CREATE INDEX "webhook_events_provider_status_idx" ON "webhook_events"("provider", "status");

-- AddForeignKey
ALTER TABLE "whatsapp_accounts" ADD CONSTRAINT "whatsapp_accounts_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_whatsapp_account_id_fkey" FOREIGN KEY ("whatsapp_account_id") REFERENCES "whatsapp_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_assigned_to_fkey" FOREIGN KEY ("assigned_to") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_sent_by_user_id_fkey" FOREIGN KEY ("sent_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media" ADD CONSTRAINT "media_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "media" ADD CONSTRAINT "media_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
