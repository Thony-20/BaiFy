const MAX_SOURCE_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

/**
 * Comprime una imagen a JPEG para guardarla como foto de empresa.
 * @param {File} file
 * @param {{ maxSize?: number, quality?: number }} options
 * @returns {Promise<string>} data URL JPEG
 */
export function compressImage(file, options = {}) {
  const maxSize = options.maxSize ?? 400;
  const quality = options.quality ?? 0.8;

  if (!(file instanceof File)) {
    return Promise.reject(new Error('Archivo inválido'));
  }

  if (!ALLOWED_TYPES.includes(file.type)) {
    return Promise.reject(new Error('Usa una imagen JPG, PNG, WEBP o GIF'));
  }

  if (file.size > MAX_SOURCE_BYTES) {
    return Promise.reject(new Error('La imagen no puede superar 5 MB'));
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      const img = new Image();

      img.onload = () => {
        const canvas = document.createElement('canvas');
        let { width, height } = img;

        if (width > height && width > maxSize) {
          height = Math.round((height * maxSize) / width);
          width = maxSize;
        } else if (height >= width && height > maxSize) {
          width = Math.round((width * maxSize) / height);
          height = maxSize;
        }

        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('No se pudo procesar la imagen'));
          return;
        }

        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };

      img.onerror = () => reject(new Error('No se pudo leer la imagen'));
      img.src = typeof reader.result === 'string' ? reader.result : '';
    };

    reader.onerror = () => reject(new Error('No se pudo leer el archivo'));
    reader.readAsDataURL(file);
  });
}
