import { composeLayerPixels, type LayerInput } from './layerPixels';
self.onmessage = (event: MessageEvent<{ id: number; input: LayerInput }>) => {
  const { id, input } = event.data;
  try {
    const pixels = composeLayerPixels(input);
    self.postMessage({ id, pixels }, { transfer: Object.values(pixels).map((p) => p.buffer) });
  } catch (error) {
    self.postMessage({ id, error: String(error) });
  }
};
