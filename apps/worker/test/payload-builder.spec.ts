import { describe, expect, it } from 'vitest';
import { buildMetaPayload } from '../src/whatsapp/payload-builder';
import { PermanentSendError } from '../src/whatsapp/send-errors';

const TO = '919876543210';
const BASE = { messaging_product: 'whatsapp', recipient_type: 'individual', to: TO };

describe('buildMetaPayload', () => {
  it('builds text with link previews off', () => {
    expect(buildMetaPayload({ type: 'text', content: { text: 'Hi there' } }, TO)).toEqual({
      ...BASE,
      type: 'text',
      text: { body: 'Hi there', preview_url: false },
    });
  });

  it('builds an image by Meta media id with its caption', () => {
    const payload = buildMetaPayload(
      { type: 'image', content: { media_id: 'ours', caption: 'The invoice', filename: null } },
      TO,
      'meta-media-1',
    );

    expect(payload).toEqual({
      ...BASE,
      type: 'image',
      image: { id: 'meta-media-1', caption: 'The invoice' },
    });
  });

  it('sends the Meta media id, never our own media id', () => {
    const payload = buildMetaPayload(
      { type: 'video', content: { media_id: 'our-uuid', caption: null } },
      TO,
      'meta-media-2',
    );

    expect(payload.video).toEqual({ id: 'meta-media-2' });
  });

  it('keeps the filename on documents only', () => {
    const document = buildMetaPayload(
      { type: 'document', content: { media_id: 'x', caption: 'Q3', filename: 'report.pdf' } },
      TO,
      'meta-doc',
    );
    expect(document.document).toEqual({ id: 'meta-doc', caption: 'Q3', filename: 'report.pdf' });

    const image = buildMetaPayload(
      { type: 'image', content: { media_id: 'x', filename: 'photo.jpg' } },
      TO,
      'meta-img',
    );
    expect(image.image).toEqual({ id: 'meta-img' });
  });

  it('drops a caption on audio, which Meta rejects', () => {
    const payload = buildMetaPayload(
      { type: 'audio', content: { media_id: 'x', caption: 'ignored' } },
      TO,
      'meta-audio',
    );
    expect(payload.audio).toEqual({ id: 'meta-audio' });
  });

  it('refuses media without a Meta media id', () => {
    expect(() => buildMetaPayload({ type: 'image', content: { media_id: 'x' } }, TO)).toThrow(
      PermanentSendError,
    );
  });

  it('builds hello_world with no components key at all', () => {
    expect(
      buildMetaPayload(
        {
          type: 'template',
          content: { template_name: 'hello_world', language: 'en_US', components: [] },
        },
        TO,
      ),
    ).toEqual({
      ...BASE,
      type: 'template',
      template: { name: 'hello_world', language: { code: 'en_US' } },
    });
  });

  it('passes template components through untouched', () => {
    const components = [
      { type: 'body', parameters: [{ type: 'text', text: 'Ranjot' }] },
      { type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: 'abc' }] },
    ];

    const payload = buildMetaPayload(
      { type: 'template', content: { template_name: 'order_update', language: 'en', components } },
      TO,
    );

    expect(payload.template).toEqual({
      name: 'order_update',
      language: { code: 'en' },
      components,
    });
  });

  it('passes interactive through untouched', () => {
    const interactive = {
      type: 'button',
      body: { text: 'Pick one' },
      action: {
        buttons: [
          { type: 'reply', reply: { id: 'yes', title: 'Yes' } },
          { type: 'reply', reply: { id: 'no', title: 'No' } },
        ],
      },
    };

    expect(buildMetaPayload({ type: 'interactive', content: { interactive } }, TO)).toEqual({
      ...BASE,
      type: 'interactive',
      interactive,
    });
  });

  it('refuses types that cannot be sent', () => {
    expect(() => buildMetaPayload({ type: 'reaction', content: {} }, TO)).toThrow(
      PermanentSendError,
    );
    expect(() => buildMetaPayload({ type: 'text', content: {} }, TO)).toThrow(PermanentSendError);
    expect(() =>
      buildMetaPayload({ type: 'template', content: { template_name: 'x' } }, TO),
    ).toThrow(PermanentSendError);
  });
});
