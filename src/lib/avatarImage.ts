export interface ProcessedAvatarResult {
  blob: Blob;
  dataUrl: string;
  width: number;
  height: number;
}

const MAX_RAW_AVATAR_BYTES = 10 * 1024 * 1024; // 10 MB

export async function processAvatarImageFile(
  file: File,
  targetSize = 240
): Promise<ProcessedAvatarResult> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Please choose an image file (PNG, JPG, WebP, or GIF).');
  }
  if (file.size > MAX_RAW_AVATAR_BYTES) {
    throw new Error('Image must be smaller than 10 MB.');
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Could not read the selected image file.'));
      el.src = objectUrl;
    });

    const srcWidth = img.naturalWidth || img.width;
    const srcHeight = img.naturalHeight || img.height;
    if (!srcWidth || !srcHeight) {
      throw new Error('Selected image has invalid dimensions.');
    }

    // Center-crop to square so avatars stay crisp and aligned
    const side = Math.min(srcWidth, srcHeight);
    const sx = Math.round((srcWidth - side) / 2);
    const sy = Math.round((srcHeight - side) / 2);

    const canvas = document.createElement('canvas');
    canvas.width = targetSize;
    canvas.height = targetSize;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Canvas image processing is unavailable in this browser.');
    }

    // Fill crisp white background in case source PNG/WebP has transparency
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, targetSize, targetSize);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, sx, sy, side, side, 0, 0, targetSize, targetSize);

    const dataUrl = canvas.toDataURL('image/jpeg', 0.82);

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (result) => {
          if (result) resolve(result);
          else reject(new Error('Could not encode processed avatar image.'));
        },
        'image/jpeg',
        0.86
      );
    });

    return {
      blob,
      dataUrl,
      width: targetSize,
      height: targetSize,
    };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
