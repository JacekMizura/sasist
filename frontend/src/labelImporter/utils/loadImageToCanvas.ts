export type LoadedImageCanvas = {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  widthPx: number;
  heightPx: number;
};

export async function loadImageToCanvas(file: File): Promise<LoadedImageCanvas> {
  const dataUrl = await readFileAsDataUrl(file);
  const img = await loadImage(dataUrl);

  const canvas = document.createElement("canvas");
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Cannot get 2D context");
  }
  ctx.drawImage(img, 0, 0);

  return {
    canvas,
    ctx,
    widthPx: img.width,
    heightPx: img.height,
  };
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to load image"));
    img.src = src;
  });
}

