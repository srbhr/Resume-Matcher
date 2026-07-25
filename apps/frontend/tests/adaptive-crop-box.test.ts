import { describe, expect, it } from 'vitest';
import {
  moveCrop,
  resizeCrop,
  type CropHandle,
  type CropRect,
} from '@/components/builder/adaptive-crop-box';

const crop: CropRect = {
  cropX: 20,
  cropY: 20,
  cropWidth: 40,
  cropHeight: 30,
};

describe('adaptive crop geometry', () => {
  it('moves the complete crop rectangle and clamps it inside the image', () => {
    expect(moveCrop(crop, 15, -10)).toEqual({
      cropX: 35,
      cropY: 10,
      cropWidth: 40,
      cropHeight: 30,
    });
    expect(moveCrop(crop, 100, 100)).toEqual({
      cropX: 60,
      cropY: 70,
      cropWidth: 40,
      cropHeight: 30,
    });
  });

  it.each([
    ['w', -10, 0, { cropX: 10, cropY: 20, cropWidth: 50, cropHeight: 30 }],
    ['e', 10, 0, { cropX: 20, cropY: 20, cropWidth: 50, cropHeight: 30 }],
    ['n', 0, -10, { cropX: 20, cropY: 10, cropWidth: 40, cropHeight: 40 }],
    ['s', 0, 10, { cropX: 20, cropY: 20, cropWidth: 40, cropHeight: 40 }],
  ] satisfies Array<[CropHandle, number, number, CropRect]>)(
    'resizes only the selected %s edge',
    (handle, dx, dy, expected) => {
      expect(resizeCrop(crop, handle, dx, dy)).toEqual(expected);
    }
  );

  it.each([
    ['nw', -20, -2, { cropX: 0, cropY: 5, cropWidth: 60, cropHeight: 45 }],
    ['ne', 20, -2, { cropX: 20, cropY: 5, cropWidth: 60, cropHeight: 45 }],
    ['sw', -20, 2, { cropX: 0, cropY: 20, cropWidth: 60, cropHeight: 45 }],
    ['se', 20, 2, { cropX: 20, cropY: 20, cropWidth: 60, cropHeight: 45 }],
  ] satisfies Array<[CropHandle, number, number, CropRect]>)(
    'resizes the %s corner proportionally around its opposite anchor',
    (handle, dx, dy, expected) => {
      expect(resizeCrop(crop, handle, dx, dy)).toEqual(expected);
    }
  );

  it('enforces a five-percent minimum edge and image bounds', () => {
    expect(resizeCrop(crop, 'e', -100, 0).cropWidth).toBe(5);
    expect(resizeCrop(crop, 's', 0, 100).cropHeight).toBe(80);
    const corner = resizeCrop(crop, 'se', 100, 100);
    expect(corner.cropX + corner.cropWidth).toBeLessThanOrEqual(100);
    expect(corner.cropY + corner.cropHeight).toBeLessThanOrEqual(100);
    expect(corner.cropWidth / corner.cropHeight).toBeCloseTo(4 / 3);
  });
});
