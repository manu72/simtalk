// Browser-side image compression for the camera translate flow. Re-encoding
// through a canvas is also what strips EXIF (including GPS) before upload, so
// this helper is doing privacy work alongside size reduction.

const DEFAULT_MAX_EDGE_PX = 1600;
const DEFAULT_TARGET_BYTES = 3 * 1024 * 1024;
const DEFAULT_OUTPUT_TYPE = 'image/jpeg';
const QUALITY_STEPS = [0.82, 0.72, 0.6, 0.5] as const;

export type CompressImageOptions = {
  readonly maxEdgePx?: number;
  readonly targetBytes?: number;
};

export type CompressedImage = {
  readonly blob: Blob;
  readonly width: number;
  readonly height: number;
  readonly bytes: number;
};

export class CompressImageError extends Error {
  override readonly cause?: unknown;
  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'CompressImageError';
    this.cause = cause;
  }
}

const loadBitmap = async (file: Blob): Promise<ImageBitmap | HTMLImageElement> => {
  if (typeof createImageBitmap === 'function') {
    try {
      // imageOrientation: 'from-image' respects EXIF rotation before we drop it.
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {
      // Fall through to <img> path below for HEIC and other formats that some
      // browsers refuse to decode via createImageBitmap.
    }
  }

  return await new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new CompressImageError('Could not decode image'));
    };
    img.src = url;
  });
};

const closeBitmap = (bitmap: ImageBitmap | HTMLImageElement): void => {
  if ('close' in bitmap && typeof bitmap.close === 'function') {
    bitmap.close();
  }
};

const computeScaledSize = (
  width: number,
  height: number,
  maxEdge: number
): { readonly width: number; readonly height: number } => {
  if (width <= 0 || height <= 0) {
    throw new CompressImageError('Image has invalid dimensions');
  }
  const longest = Math.max(width, height);
  if (longest <= maxEdge) {
    return { width: Math.round(width), height: Math.round(height) };
  }
  const scale = maxEdge / longest;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale))
  };
};

const canvasToBlob = (canvas: HTMLCanvasElement, quality: number): Promise<Blob> =>
  new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new CompressImageError('Canvas could not encode image'));
          return;
        }
        resolve(blob);
      },
      DEFAULT_OUTPUT_TYPE,
      quality
    );
  });

export const compressImage = async (
  file: File,
  options: CompressImageOptions = {}
): Promise<CompressedImage> => {
  const maxEdge = options.maxEdgePx ?? DEFAULT_MAX_EDGE_PX;
  const targetBytes = options.targetBytes ?? DEFAULT_TARGET_BYTES;

  let bitmap: ImageBitmap | HTMLImageElement;
  try {
    bitmap = await loadBitmap(file);
  } catch (error) {
    if (error instanceof CompressImageError) throw error;
    throw new CompressImageError('Could not decode image', error);
  }

  try {
    const sourceWidth = 'width' in bitmap ? bitmap.width : (bitmap as HTMLImageElement).naturalWidth;
    const sourceHeight =
      'height' in bitmap ? bitmap.height : (bitmap as HTMLImageElement).naturalHeight;
    const { width, height } = computeScaledSize(sourceWidth, sourceHeight, maxEdge);

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new CompressImageError('Canvas 2D context is unavailable');
    }
    ctx.drawImage(bitmap as CanvasImageSource, 0, 0, width, height);

    let lastBlob: Blob | null = null;
    for (const quality of QUALITY_STEPS) {
      const blob = await canvasToBlob(canvas, quality);
      lastBlob = blob;
      if (blob.size <= targetBytes) {
        return { blob, width, height, bytes: blob.size };
      }
    }

    if (!lastBlob) {
      throw new CompressImageError('Image compression produced no output');
    }
    return { blob: lastBlob, width, height, bytes: lastBlob.size };
  } finally {
    closeBitmap(bitmap);
  }
};
