import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { isNativeApp } from './api-base';

function dataUrlToFile(dataUrl: string, filename: string): File {
  const [meta, b64] = dataUrl.split(',');
  const mime = meta?.match(/data:([^;]+)/)?.[1] ?? 'image/jpeg';
  const bin = atob(b64 ?? '');
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return new File([buf], filename, { type: mime });
}

async function photoToFile(
  dataUrl: string | undefined,
  prefix: string,
): Promise<File | null> {
  if (!dataUrl?.startsWith('data:')) return null;
  const ext = dataUrl.includes('image/png') ? 'png' : 'jpg';
  return dataUrlToFile(dataUrl, `${prefix}-${Date.now()}.${ext}`);
}

/** 平板 App：调起系统相机拍试卷/错题 */
export async function captureImageFromCamera(): Promise<File | null> {
  if (!isNativeApp()) return null;
  const photo = await Camera.getPhoto({
    quality: 88,
    allowEditing: false,
    resultType: CameraResultType.DataUrl,
    source: CameraSource.Camera,
    saveToGallery: false,
    correctOrientation: true,
  });
  return photoToFile(photo.dataUrl, 'wuxian-camera');
}

/** 平板 App：从相册选图 */
export async function pickImageFromGallery(): Promise<File | null> {
  if (!isNativeApp()) return null;
  const photo = await Camera.getPhoto({
    quality: 88,
    allowEditing: false,
    resultType: CameraResultType.DataUrl,
    source: CameraSource.Photos,
    correctOrientation: true,
  });
  return photoToFile(photo.dataUrl, 'wuxian-gallery');
}

export function supportsNativeCamera(): boolean {
  return isNativeApp();
}
