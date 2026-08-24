import { downloadBlob } from "@/lib/utils";

export type SeanOfficeModule = "word" | "pdf" | "excel";

function stripExtension(name: string): string {
  return name.replace(/\.[^/.]+$/, "") || name;
}

/** Sanitize for filesystem: remove illegal chars, collapse spaces to hyphens. */
export function sanitizeBasename(name: string): string {
  const stripped = stripExtension(name);
  const cleaned = stripped
    .replace(/[\\/:*?"<>|]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
  return cleaned || "document";
}

/**
 * SeanOffice-{module}-{basename}[.{ext}]
 * @param ext Output extension without dot (e.g. "docx", "zip"). Falls back to original file ext.
 * @param suffix Optional suffix appended to basename (e.g. "edited", "tables")
 */
export function buildSeanOfficeFilename(
  module: SeanOfficeModule,
  originalName: string,
  ext?: string,
  suffix?: string
): string {
  let base = sanitizeBasename(originalName);
  if (suffix) base = `${base}-${suffix}`;
  const extension = ext ?? originalName.match(/\.([^.]+)$/)?.[1] ?? "bin";
  return `SeanOffice-${module}-${base}.${extension.replace(/^\./, "")}`;
}

export function downloadSeanOfficeBlob(
  blob: Blob,
  module: SeanOfficeModule,
  originalName: string,
  ext?: string,
  suffix?: string
): void {
  downloadBlob(
    blob,
    buildSeanOfficeFilename(module, originalName, ext, suffix)
  );
}
