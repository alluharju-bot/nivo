import { expect, it } from 'vitest';
import type * as THREE from 'three';
import { traceDiagnostics } from './traceDiagnostics';

it('records pending compilation, first frame and bounded history independently of later retries', () => {
  let time = 100;
  const diagnostics = traceDiagnostics(() => time);
  diagnostics.start();
  const finish = diagnostics.compile(120000);
  time += 5000;
  diagnostics.stage('compiling');
  expect(diagnostics.timing().compilations[0]).toMatchObject({ pending: true, elapsedMs: 5000 });
  finish();
  diagnostics.firstFrame();
  time += 1000;
  diagnostics.firstFrame();
  expect(diagnostics.timing()).toMatchObject({ firstFrameMs: 5000, elapsedMs: 6000 });
  expect(diagnostics.timing().compilations[0]).toMatchObject({ pending: false, elapsedMs: 5000 });
  const late = diagnostics.compile(100);
  diagnostics.start();
  late('old cancelled request');
  expect(diagnostics.timing().compilations).toEqual([]);
  expect(diagnostics.timing().firstFrameMs).toBeUndefined();
  for (let i = 0; i < 100; i++) {
    diagnostics.stage(String(i));
    diagnostics.compile(50)();
    diagnostics.error('e'.repeat(3000));
  }
  expect(diagnostics.timing().stages).toHaveLength(32);
  expect(diagnostics.timing().compilations).toHaveLength(16);
  expect(diagnostics.timing().errors).toHaveLength(4);
  expect(diagnostics.timing().errors[0]).toHaveLength(2000);
});

it('exports only technical fields, excluding private camera and project data', () => {
  const renderer = {
    getContext: () => ({
      getExtension: () => null,
      getParameter: () => 'Test GPU',
      isContextLost: () => false,
    }),
    domElement: {
      dataset: {
        tracePhase: 'compiling',
        traceSamples: '0',
        camera: 'private position',
        project: 'private project',
        selectedIds: 'private selection',
      },
    },
  } as unknown as THREE.WebGLRenderer;
  const report = traceDiagnostics().report(renderer);
  expect(report).toMatchObject({ gpu: 'Test GPU', render: { tracePhase: 'compiling' } });
  expect(JSON.stringify(report)).not.toContain('private');
});
