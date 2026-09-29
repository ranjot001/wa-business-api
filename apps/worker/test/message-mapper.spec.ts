import { describe, expect, it } from 'vitest';
import { mapInboundMessage, toPreview } from '../src/whatsapp/message-mapper';
import * as fixtures from './fixtures/inbound';

describe('mapInboundMessage', () => {
  it('maps text', () => {
    const mapped = mapInboundMessage(fixtures.textMessage);

    expect(mapped.type).toBe('text');
    expect(mapped.content).toEqual({ text: 'Hello, is this still available?' });
    expect(mapped.media).toBeNull();
    expect(mapped.preview).toBe('Hello, is this still available?');
  });

  it('maps image, keeping the caption as the preview and asking for a download', () => {
    const mapped = mapInboundMessage(fixtures.imageMessage);

    expect(mapped.type).toBe('image');
    expect(mapped.content).toEqual({
      media_id: '1089374652819374',
      mime_type: 'image/jpeg',
      sha256: 'kEZ0kPFvBXyPBxQaXJxJ7xQe9zH3jJ1mN2oP3qR4sT0=',
      caption: 'Here is the photo',
      filename: null,
    });
    expect(mapped.media).toEqual({ waMediaId: '1089374652819374', mimeType: 'image/jpeg' });
    expect(mapped.preview).toBe('Here is the photo');
  });

  it('maps document, falling back to the filename for the preview', () => {
    const mapped = mapInboundMessage(fixtures.documentMessage);

    expect(mapped.type).toBe('document');
    expect(mapped.content.filename).toBe('invoice-2026-09.pdf');
    expect(mapped.media?.waMediaId).toBe('2198465738291046');
    expect(mapped.preview).toBe('invoice-2026-09.pdf');
  });

  it('maps audio with no caption or filename to a type marker', () => {
    const mapped = mapInboundMessage(fixtures.audioMessage);

    expect(mapped.type).toBe('audio');
    expect(mapped.media?.mimeType).toBe('audio/ogg; codecs=opus');
    expect(mapped.preview).toBe('[audio]');
  });

  it('maps video', () => {
    const mapped = mapInboundMessage(fixtures.videoMessage);

    expect(mapped.type).toBe('video');
    expect(mapped.preview).toBe('Short clip');
    expect(mapped.media?.waMediaId).toBe('4318687950413268');
  });

  it('maps sticker', () => {
    const mapped = mapInboundMessage(fixtures.stickerMessage);

    expect(mapped.type).toBe('sticker');
    expect(mapped.media?.waMediaId).toBe('5429798061524379');
    expect(mapped.preview).toBe('[sticker]');
  });

  it('maps location to lat, lng, name and address', () => {
    const mapped = mapInboundMessage(fixtures.locationMessage);

    expect(mapped.type).toBe('location');
    expect(mapped.content).toEqual({
      lat: 28.6139,
      lng: 77.209,
      name: 'Connaught Place',
      address: 'New Delhi, India',
    });
    expect(mapped.media).toBeNull();
  });

  it('keeps a shared contact card raw', () => {
    const mapped = mapInboundMessage(fixtures.contactsMessage);

    expect(mapped.type).toBe('contacts');
    expect(mapped.content.contacts).toEqual(fixtures.contactsMessage.contacts);
    expect(mapped.preview).toBe('[contact card]');
  });

  it('maps a reaction, pointing at the message it reacted to', () => {
    const mapped = mapInboundMessage(fixtures.reactionMessage);

    expect(mapped.type).toBe('reaction');
    expect(mapped.content).toEqual({
      emoji: '👍',
      reacted_to_wa_message_id: fixtures.textMessage.id,
    });
    expect(mapped.contextWaMessageId).toBe(fixtures.textMessage.id);
    expect(mapped.preview).toBe('Reacted 👍');
  });

  it('treats a reaction with no emoji as a removal', () => {
    const mapped = mapInboundMessage(fixtures.reactionRemovedMessage);

    expect(mapped.content.emoji).toBeNull();
    expect(mapped.preview).toBe('Removed a reaction');
  });

  it('maps a quick reply button, keeping the payload', () => {
    const mapped = mapInboundMessage(fixtures.buttonMessage);

    expect(mapped.type).toBe('button');
    expect(mapped.content).toEqual({ payload: 'STOP_PROMOTIONS', title: 'Stop promotions' });
    expect(mapped.contextWaMessageId).toBe('wamid.outbound.template.1');
  });

  it('maps an interactive button reply', () => {
    const mapped = mapInboundMessage(fixtures.interactiveButtonReply);

    expect(mapped.type).toBe('interactive');
    expect(mapped.content).toEqual({
      payload: 'track-order',
      title: 'Track my order',
      interactive_type: 'button_reply',
    });
  });

  it('maps an interactive list reply', () => {
    const mapped = mapInboundMessage(fixtures.interactiveListReply);

    expect(mapped.content).toEqual({
      payload: 'plan-pro',
      title: 'Pro plan',
      interactive_type: 'list_reply',
    });
  });

  it('falls back to unsupported with the raw payload', () => {
    const mapped = mapInboundMessage(fixtures.unsupportedMessage);

    expect(mapped.type).toBe('unsupported');
    expect(mapped.content.wa_type).toBe('unsupported');
    expect(mapped.content.raw).toEqual(fixtures.unsupportedMessage);
    expect(mapped.media).toBeNull();
  });

  it('falls back to unsupported for a type Meta has not invented yet', () => {
    const mapped = mapInboundMessage({
      from: '919876543210',
      id: 'wamid.future',
      type: 'hologram',
    });

    expect(mapped.type).toBe('unsupported');
    expect(mapped.content.wa_type).toBe('hologram');
    expect(mapped.preview).toBe('[hologram message]');
  });

  it('carries the reply context through', () => {
    const mapped = mapInboundMessage(fixtures.replyMessage);

    expect(mapped.type).toBe('text');
    expect(mapped.contextWaMessageId).toBe('wamid.outbound.1');
  });

  it('never throws on a message with nothing in it', () => {
    const mapped = mapInboundMessage({});

    expect(mapped.type).toBe('unsupported');
    expect(mapped.media).toBeNull();
    expect(mapped.contextWaMessageId).toBeNull();
  });

  it('stores a media message with no id but does not ask for a download', () => {
    const mapped = mapInboundMessage({ type: 'image', image: { mime_type: 'image/png' } });

    expect(mapped.type).toBe('image');
    expect(mapped.media).toBeNull();
  });
});

describe('toPreview', () => {
  it('collapses whitespace', () => {
    expect(toPreview('a\n\n  b   c')).toBe('a b c');
  });

  it('truncates long text', () => {
    expect(toPreview('x'.repeat(200))).toHaveLength(120);
    expect(toPreview('x'.repeat(200)).endsWith('...')).toBe(true);
  });

  it('leaves short text alone', () => {
    expect(toPreview('short')).toBe('short');
  });
});
