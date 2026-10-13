import { prepareSnapshot, type SnapshotRequest } from './prepareSnapshot';

self.onmessage = async (event: MessageEvent<SnapshotRequest & { id: number }>) => {
  const { id } = event.data;
  try {
    self.postMessage({ id, hash: await prepareSnapshot(event.data) });
  } catch (error) {
    self.postMessage({ id, error: (error as Error).message });
  }
};
