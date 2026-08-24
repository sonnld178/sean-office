export type UploadProgressCallback = (
  percent: number,
  message?: string
) => void;

/** Read file in chunks and report 0–100 progress */
export async function readFileWithProgress(
  file: File,
  onProgress: UploadProgressCallback
): Promise<ArrayBuffer> {
  if (file.size === 0) {
    onProgress(100, file.name);
    return new ArrayBuffer(0);
  }

  const reader = file.stream().getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;

  onProgress(0, file.name);

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.length;
    onProgress(
      Math.min(99, Math.round((loaded / file.size) * 100)),
      file.name
    );
  }

  const buffer = new Uint8Array(loaded);
  let offset = 0;
  for (const chunk of chunks) {
    buffer.set(chunk, offset);
    offset += chunk.length;
  }

  onProgress(100, file.name);
  return buffer.buffer;
}

export async function readFilesWithProgress(
  files: File[],
  onProgress: UploadProgressCallback
): Promise<{ file: File; buffer: ArrayBuffer }[]> {
  const results: { file: File; buffer: ArrayBuffer }[] = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const buffer = await readFileWithProgress(file, (p, msg) => {
      const overall = Math.round(((i + p / 100) / files.length) * 100);
      onProgress(overall, msg ?? file.name);
    });
    results.push({ file, buffer });
  }

  return results;
}

/** Server mode upload with real XMLHttpRequest progress */
export function uploadFileWithProgress(
  file: File,
  onProgress: UploadProgressCallback
): Promise<{ jobId: string; expiresAt: string }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const formData = new FormData();
    formData.append("file", file);

    xhr.upload.addEventListener("progress", (event) => {
      if (!event.lengthComputable) return;
      const percent = Math.round((event.loaded / event.total) * 100);
      onProgress(percent, file.name);
    });

    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText));
        } catch {
          reject(new Error("Invalid server response"));
        }
      } else {
        reject(new Error(`Upload failed (${xhr.status})`));
      }
    });

    xhr.addEventListener("error", () => reject(new Error("Upload failed")));
    xhr.open("POST", "/api/upload");
    xhr.send(formData);
  });
}

export async function uploadFilesWithProgress(
  files: File[],
  onProgress: UploadProgressCallback
): Promise<void> {
  for (let i = 0; i < files.length; i++) {
    await uploadFileWithProgress(files[i], (p, msg) => {
      const overall = Math.round(((i + p / 100) / files.length) * 100);
      onProgress(overall, msg ?? files[i].name);
    });
  }
}

export interface LoadedFile {
  file: File;
  buffer: ArrayBuffer;
}
