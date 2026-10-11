export type CropRegion = { x: number; y: number; width: number; height: number };

export function cropPixelRegion(crop: CropRegion, width: number, height: number): CropRegion {
  return {
    x: crop.x * width / 100,
    y: crop.y * height / 100,
    width: crop.width * width / 100,
    height: crop.height * height / 100,
  };
}

export async function croppedImageFile(image: HTMLImageElement, crop: CropRegion, name: string): Promise<File> {
  const region = cropPixelRegion(crop, image.naturalWidth, image.naturalHeight);
  if (region.width <= 0 || region.height <= 0) throw new Error('יש לבחור אזור לחיתוך');
  const scale = Math.min(1, 2048 / Math.max(region.width, region.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(region.width * scale));
  canvas.height = Math.max(1, Math.round(region.height * scale));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('לא ניתן לעבד את התמונה');
  context.drawImage(image, region.x, region.y, region.width, region.height, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((result) => result ? resolve(result) : reject(new Error('חיתוך התמונה נכשל')), 'image/png');
  });
  return new File([blob], `${name.replace(/\.[^.]+$/, '')}-cropped.png`, { type: 'image/png' });
}