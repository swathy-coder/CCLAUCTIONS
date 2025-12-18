/**
 * Image compression utility for reducing photo file sizes
 * Converts images to JPEG format with 80% quality and returns base64
 */

/**
 * Compress an image file to JPEG 80% quality and convert to base64
 * @param file - Image file to compress
 * @returns Promise resolving to base64 string
 */
export async function compressImageToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Could not get canvas context'));
          return;
        }

        ctx.drawImage(img, 0, 0);

        // Convert to JPEG with 80% quality
        const base64 = canvas.toDataURL('image/jpeg', 0.8);
        resolve(base64);
      };

      img.onerror = () => {
        reject(new Error('Failed to load image'));
      };

      img.src = e.target?.result as string;
    };

    reader.onerror = () => {
      reject(new Error('Failed to read file'));
    };

    reader.readAsDataURL(file);
  });
}

/**
 * Compress multiple images (for team rosters)
 * @param files - Array of image files
 * @returns Promise resolving to array of base64 strings
 */
export async function compressImagesToBase64(files: File[]): Promise<string[]> {
  return Promise.all(files.map((file) => compressImageToBase64(file)));
}

/**
 * Get estimated size reduction when compressing image
 * Original size vs compressed JPEG 80%
 * @param originalSize - Size in bytes
 * @returns Estimated compressed size in bytes
 */
export function estimateCompressedSize(originalSize: number): number {
  // JPEG 80% typically reduces size to ~30-40% of original PNG/uncompressed
  return Math.ceil(originalSize * 0.35);
}
