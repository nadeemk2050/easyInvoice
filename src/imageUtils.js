/**
 * Image compression and optimization utilities for easyInvoice.
 * Prevents LocalStorage QuotaExceededError and Firestore 1MB document limit issues
 * by resizing and compressing uploaded logos, headers, stamps, and signatures.
 */

/**
 * Compresses an image File, Blob, or base64 Data URL to fit within target dimensions and size.
 * Automatically preserves alpha transparency for PNGs and compresses JPEGs.
 *
 * @param {File|Blob|string} fileOrDataUrl
 * @param {Object} [options]
 * @param {number} [options.maxWidth=1200]
 * @param {number} [options.maxHeight=1200]
 * @param {number} [options.quality=0.82]
 * @returns {Promise<string>} Compressed Base64 Data URL
 */
export function compressImage(fileOrDataUrl, options = {}) {
  const {
    maxWidth = 1200,
    maxHeight = 1200,
    quality = 0.82,
  } = options;

  return new Promise((resolve, reject) => {
    if (!fileOrDataUrl) {
      return reject(new Error("No image provided"));
    }

    const processImage = (src, isPng = false) => {
      const img = new Image();
      img.crossOrigin = "anonymous";

      img.onload = () => {
        try {
          let width = img.width;
          let height = img.height;

          // Scale down maintaining aspect ratio
          if (width > maxWidth || height > maxHeight) {
            const ratio = Math.min(maxWidth / width, maxHeight / height);
            width = Math.max(1, Math.round(width * ratio));
            height = Math.max(1, Math.round(height * ratio));
          }

          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;

          const ctx = canvas.getContext("2d");
          if (!ctx) {
            return resolve(src);
          }

          if (isPng) {
            // Preserve transparent background for PNGs (signatures, stamps, transparent logos)
            ctx.clearRect(0, 0, width, height);
            ctx.drawImage(img, 0, 0, width, height);
            const pngData = canvas.toDataURL("image/png");

            // If PNG is still large (> 350KB), downscale further to save space
            if (pngData.length > 350000 && (width > 600 || height > 600)) {
              const smallCanvas = document.createElement("canvas");
              const scale = 0.7;
              smallCanvas.width = Math.max(1, Math.round(width * scale));
              smallCanvas.height = Math.max(1, Math.round(height * scale));
              const sCtx = smallCanvas.getContext("2d");
              if (sCtx) {
                sCtx.clearRect(0, 0, smallCanvas.width, smallCanvas.height);
                sCtx.drawImage(canvas, 0, 0, smallCanvas.width, smallCanvas.height);
                return resolve(smallCanvas.toDataURL("image/png"));
              }
            }
            resolve(pngData);
          } else {
            // Opaque JPEG compression
            ctx.fillStyle = "#FFFFFF";
            ctx.fillRect(0, 0, width, height);
            ctx.drawImage(img, 0, 0, width, height);
            const jpegData = canvas.toDataURL("image/jpeg", quality);
            resolve(jpegData);
          }
        } catch (err) {
          console.warn("Canvas compression error, falling back to original:", err);
          resolve(src);
        }
      };

      img.onerror = (err) => {
        console.error("Image loading failed:", err);
        reject(err);
      };

      img.src = src;
    };

    if (typeof fileOrDataUrl === "string") {
      const isPng = fileOrDataUrl.startsWith("data:image/png") || fileOrDataUrl.toLowerCase().includes(".png");
      processImage(fileOrDataUrl, isPng);
    } else if (fileOrDataUrl instanceof Blob || fileOrDataUrl instanceof File) {
      const isPng = fileOrDataUrl.type === "image/png" || fileOrDataUrl.name?.toLowerCase().endsWith(".png");
      const reader = new FileReader();
      reader.onload = (e) => {
        processImage(e.target.result, isPng);
      };
      reader.onerror = (err) => reject(err);
      reader.readAsDataURL(fileOrDataUrl);
    } else {
      reject(new Error("Unsupported image format"));
    }
  });
}

/**
 * Optimizes existing stored images in localStorage to free up browser storage quota immediately.
 * Scans image lists and selected images, compressing any oversized base64 strings.
 *
 * @param {string} uid User ID
 */
export async function optimizeStoredImages(uid) {
  if (!uid) return;
  const pfx = (key) => uid + "_" + key;

  const listKeys = ["easyinvoice_logos", "easyinvoice_signatures", "easyinvoice_stamps"];
  for (const rawKey of listKeys) {
    try {
      const fullKey = pfx(rawKey);
      const rawVal = localStorage.getItem(fullKey);
      if (!rawVal) continue;
      const list = JSON.parse(rawVal);
      if (!Array.isArray(list) || list.length === 0) continue;

      let changed = false;
      const optimizedList = await Promise.all(
        list.map(async (item) => {
          if (item?.dataUrl && item.dataUrl.length > 150000) {
            try {
              const maxDim = rawKey.includes("logo") ? 1200 : 800;
              const compressed = await compressImage(item.dataUrl, { maxWidth: maxDim, maxHeight: maxDim });
              if (compressed.length < item.dataUrl.length) {
                changed = true;
                return { ...item, dataUrl: compressed };
              }
            } catch (err) {
              console.warn("Could not compress item:", err);
            }
          }
          return item;
        })
      );

      if (changed) {
        localStorage.setItem(fullKey, JSON.stringify(optimizedList));
      }
    } catch (err) {
      console.warn("Storage cleanup error for " + rawKey, err);
    }
  }

  const singleKeys = ["easyinvoice_selectedLogo", "easyinvoice_selectedSignature", "easyinvoice_selectedStamp"];
  for (const rawKey of singleKeys) {
    try {
      const fullKey = pfx(rawKey);
      const val = localStorage.getItem(fullKey);
      if (val && typeof val === "string" && val.startsWith("data:image") && val.length > 150000) {
        const maxDim = rawKey.includes("Logo") ? 1200 : 800;
        const compressed = await compressImage(val, { maxWidth: maxDim, maxHeight: maxDim });
        if (compressed.length < val.length) {
          localStorage.setItem(fullKey, compressed);
        }
      }
    } catch (err) {
      console.warn("Storage cleanup error for " + rawKey, err);
    }
  }
}
