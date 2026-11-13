import { zipSync, strToU8 } from 'fflate';
import { canvasPNG } from './traceJob';
import { downloadFile, safeFilename } from '../storage/projects';
import type { AnimationRenderSettings } from './animationRender';

export type AnimationOutputFormat = 'mp4' | 'png';
type Pickers = {
  showDirectoryPicker?: (options: { mode: 'readwrite' }) => Promise<FileSystemDirectoryHandle>;
  showSaveFilePicker?: (options: {
    suggestedName: string;
    types: { description: string; accept: Record<string, string[]> }[];
  }) => Promise<FileSystemFileHandle>;
};
export type AnimationDestination = {
  name: string;
  directory?: FileSystemDirectoryHandle;
  file?: FileSystemFileHandle;
};
/** Call directly from the user's click, before importing codecs or doing GPU work. */
export async function chooseAnimationDestination(
  format: AnimationOutputFormat,
  name: string,
): Promise<AnimationDestination> {
  const safe = safeFilename(name),
    pickers = window as unknown as Pickers;
  if (format === 'png' && pickers.showDirectoryPicker) {
    const root = await pickers.showDirectoryPicker({ mode: 'readwrite' });
    const directory = await root.getDirectoryHandle(`${safe}-${Date.now()}`, { create: true });
    return { name: safe, directory };
  }
  if (format === 'mp4' && pickers.showSaveFilePicker)
    return {
      name: safe,
      file: await pickers.showSaveFilePicker({
        suggestedName: `${safe}.mp4`,
        types: [{ description: 'MP4-video', accept: { 'video/mp4': ['.mp4'] } }],
      }),
    };
  return { name: safe };
}

export async function createAnimationOutput(
  format: AnimationOutputFormat,
  destination: AnimationDestination,
  settings: AnimationRenderSettings,
  metadata: unknown,
) {
  let count = 0;
  const writeFile = async (name: string, data: Blob | string) => {
    const file = await destination.directory!.getFileHandle(name, { create: true });
    const stream = await file.createWritable();
    try {
      await stream.write(data);
      await stream.close();
    } catch (e) {
      await stream.abort().catch(() => {});
      throw e;
    }
  };
  const manifest = (complete: boolean) =>
    JSON.stringify(
      {
        format: 'nivo-animation-frames-v1',
        settings,
        framesWritten: count,
        complete,
        animation: metadata,
      },
      null,
      2,
    );
  if (format === 'png') {
    let entries: Record<string, Uint8Array> = {},
      bytes = 0,
      part = 1;
    const flush = (complete: boolean) => {
      if (!Object.keys(entries).length) return;
      entries['render.json'] = strToU8(manifest(complete));
      entries['README.txt'] = strToU8(
        `Nivo PNG sequence. Extract all parts into one folder.\nffmpeg -framerate ${settings.fps} -i frame-%06d.png -c:v libx264 -crf 16 -pix_fmt yuv420p animation.mp4\nFrames start at 000000; source time starts at ${settings.start}s.\n`,
      );
      const zip = zipSync(entries, { level: 0 });
      downloadFile(
        zip as Uint8Array<ArrayBuffer>,
        `${destination.name}-${String(part++).padStart(3, '0')}.zip`,
        'application/zip',
      );
      entries = {};
      bytes = 0;
    };
    if (destination.directory) await writeFile('render.json', manifest(false));
    return {
      async add(canvas: HTMLCanvasElement, index: number) {
        const name = `frame-${String(index).padStart(6, '0')}.png`,
          blob = await canvasPNG(canvas);
        if (destination.directory) await writeFile(name, blob);
        else {
          if (bytes + blob.size > 64 * 1024 * 1024) flush(false);
          entries[name] = new Uint8Array(await blob.arrayBuffer());
          bytes += blob.size;
        }
        count++;
      },
      async finish() {
        if (destination.directory) await writeFile('render.json', manifest(true));
        else flush(true);
      },
      async cancel() {
        if (destination.directory) await writeFile('render.json', manifest(false));
        else flush(false);
      },
    };
  }
  const {
    Output,
    BufferTarget,
    StreamTarget,
    Mp4OutputFormat,
    CanvasSource,
    Quality,
    canEncodeVideo,
  } = await import('mediabunny');
  const quality = new Quality('very-high');
  if (
    !(await canEncodeVideo('avc', {
      width: settings.width,
      height: settings.height,
      frameRate: settings.fps,
      quality,
    }))
  )
    throw new Error(
      'Selain ei tue H.264-vientiä tällä resoluutiolla. Valitse häviötön PNG-kuvasarja.',
    );
  const stream = await destination.file?.createWritable();
  const buffer = stream ? undefined : new BufferTarget();
  const output = new Output({
    format: new Mp4OutputFormat({ fastStart: 'fragmented' }),
    target: stream ? new StreamTarget(stream) : buffer!,
  });
  let source: InstanceType<typeof CanvasSource> | undefined,
    encodedBytes = 0;
  return {
    async add(canvas: HTMLCanvasElement, index: number) {
      if (!source) {
        source = new CanvasSource(canvas, {
          codec: 'avc',
          quality,
          onEncodedPacket: (packet) => {
            encodedBytes += packet.data.byteLength;
            if (!stream && encodedBytes > 256 * 1024 * 1024)
              throw new Error(
                'Videon muistiraja saavutettiin. Käytä lyhyempää aikaväliä tai selainta, joka tukee suoraa tiedostotallennusta.',
              );
          },
        });
        output.addVideoTrack(source, { frameRate: settings.fps });
        await output.start();
      }
      await source.add(index / settings.fps, 1 / settings.fps);
      count++;
    },
    async finish() {
      source?.close();
      await output.finalize();
      if (buffer?.buffer) downloadFile(buffer.buffer, `${destination.name}.mp4`, 'video/mp4');
    },
    async cancel() {
      await output.cancel();
    },
  };
}
