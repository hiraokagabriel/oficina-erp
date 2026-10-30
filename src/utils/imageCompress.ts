import { acceptImageFile, fitWithin } from '../services/photos';

// Reduz a foto escolhida: JPEG 1600 px (original da OS) e 320 px (miniatura). Passar pelo canvas descarta o EXIF.

export const FULL_MAX_SIDE = 1600;
export const FULL_QUALITY = 0.8;
export const THUMB_MAX_SIDE = 320;
export const THUMB_QUALITY = 0.7;

export interface CompressedImage {
  full: Blob;
  thumb: Blob;
  /** Medidas do `full`. */
  width: number;
  height: number;
}

/** Valida o arquivo; lança Error com a mensagem em pt-BR se for recusado. */
export const assertAcceptableImage = (file: Pick<File, 'type' | 'size'>): void => {
  const r = acceptImageFile(file.type, file.size);
  if (!r.ok) throw new Error(r.message);
};

const drawToJpeg = (bmp: ImageBitmap, maxSide: number, quality: number): Promise<{ blob: Blob; width: number; height: number }> => {
  const { width, height } = fitWithin(bmp.width, bmp.height, maxSide);
  if (width === 0 || height === 0) return Promise.reject(new Error('Imagem inválida.'));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return Promise.reject(new Error('Não foi possível processar a imagem.'));
  // Fundo branco: PNG/WebP transparente viraria preto em JPEG.
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(bmp, 0, 0, width, height);
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      blob => (blob ? resolve({ blob, width, height }) : reject(new Error('Não foi possível gerar a foto reduzida.'))),
      'image/jpeg',
      quality
    );
  });
};

export const compressImage = async (file: File): Promise<CompressedImage> => {
  assertAcceptableImage(file);
  let bmp: ImageBitmap;
  try {
    bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw new Error('Não foi possível abrir a imagem. O arquivo pode estar corrompido.');
  }
  try {
    const full = await drawToJpeg(bmp, FULL_MAX_SIDE, FULL_QUALITY);
    const thumb = await drawToJpeg(bmp, THUMB_MAX_SIDE, THUMB_QUALITY);
    return { full: full.blob, thumb: thumb.blob, width: full.width, height: full.height };
  } finally {
    bmp.close();
  }
};
