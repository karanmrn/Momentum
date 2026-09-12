import { describe, expect, it } from 'vitest';
import { entryArea } from '../../src/entry';
import { areaShareUrl } from '../../src/AreaShare';
import { areas } from '../../packages/contracts';

describe('public area links', () => {
  it('lands each shared link on the same pilot after refresh', () => {
    for (const area of areas) {
      const url = areaShareUrl(area.id, 'https://streetwise-safety.vercel.app');
      expect(url).toBe(`https://streetwise-safety.vercel.app/?area=${area.id}`);
      expect(entryArea(new URL(url!).search)).toEqual({areaId:area.id, invalid:false});
    }
  });
  it('rejects unsafe origins and unknown pilot values', () => {
    for (const origin of ['http://localhost:4173', 'https://127.0.0.1', 'https://private.local', 'https://example.com/path', 'https://user:secret@example.com', 'https://example.com?token=x']) {
      expect(areaShareUrl(areas[0].id, origin)).toBeUndefined();
    }
    expect(areaShareUrl('unknown' as never, 'https://streetwise-safety.vercel.app')).toBeUndefined();
    expect(areaShareUrl(areas[0].id)).toBeUndefined();
    expect(entryArea('?area=unknown').invalid).toBe(true);
    expect(entryArea('').invalid).toBe(false);
  });
});

it('decodes each rendered QR to its exact area URL', async () => {
  const { default: QRCode } = await import('qrcode');
  const { default: jsQR } = await import('jsqr');
  for (const area of areas) {
    const url = areaShareUrl(area.id, 'https://streetwise-safety.vercel.app')!;
    const { modules } = QRCode.create(url, {errorCorrectionLevel:'M'});
    const scale = 8;
    const width = (modules.size + 8) * scale;
    const pixels = new Uint8ClampedArray(width * width * 4).fill(255);
    for (let y = 0; y < modules.size; y++) {
      for (let x = 0; x < modules.size; x++) {
        if (!modules.get(y, x)) continue;
        for (let dy = 0; dy < scale; dy++) for (let dx = 0; dx < scale; dx++) {
          const offset = (((y+4)*scale+dy)*width + (x+4)*scale+dx)*4;
          pixels[offset] = pixels[offset+1] = pixels[offset+2] = 0;
        }
      }
    }
    expect(jsQR(pixels, width, width)?.data).toBe(url);
  }
});
