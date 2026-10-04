import { expect, test } from 'vitest';
import { calibrateImage, referenceImageSchema } from './referenceImages';
import { sectionFrame } from './sections';
import { fromUV } from './sketch';
import { freshProject, parseProject } from './project';

test('image calibration preserves the first reference point for floor and elevation', () => {
  for (const axis of ['x', 'y', 'z'] as const) {
    const image = referenceImageSchema.parse({
      id: 'image',
      name: 'Plan',
      assetId: 'asset',
      frame: sectionFrame(axis, [130, 250, 1200]),
      width: 6000,
      height: 4000,
    });
    const before = fromUV([image.width * 0.2, image.height * 0.6], image.frame);
    const calibrated = calibrateImage(image, [0.2, 0.4], [0.7, 0.4], 1500);
    expect(calibrated.width).toBeCloseTo(3000, 6);
    expect(calibrated.height).toBeCloseTo(2000, 6);
    expect(calibrated.locked).toBe(true);
    fromUV([calibrated.width * 0.2, calibrated.height * 0.6], calibrated.frame).forEach((n, i) =>
      expect(n).toBeCloseTo(before[i], 6),
    );
    const project = {
      ...freshProject(),
      assets: {
        asset: { name: 'plan.png', dataUrl: 'data:image/png;base64,AAAA', width: 100, height: 100 },
      },
      referenceImages: [calibrated],
    };
    expect(parseProject(JSON.stringify(project)).referenceImages).toEqual([calibrated]);
    expect(() => parseProject(JSON.stringify({ ...project, assets: {} }))).toThrow(
      'Pohjakuvan kuva puuttuu',
    );
    expect(() => calibrateImage(image, [0.2, 0.4], [0.2, 0.4], 1000)).toThrow('kaksi eri pistettä');
  }
});
