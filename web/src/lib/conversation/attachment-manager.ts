import type { AttachmentData } from "./chat-protocol";

export const MAX_ATTACHMENTS = 8;
export const MAX_PASTE_BLOCKS = 4;
export const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
export const PDF_MAX_SIZE = 20 * 1024 * 1024; // 20MB
export const PASTE_THRESHOLD_LINES = 5;
export const PASTE_THRESHOLD_CHARS = 500;

export interface PastedBlock {
  id: string;
  text: string;
  lineCount: number;
  charCount: number;
  preview: string;
  ext?: string;
}

export interface AttachmentDraft {
  id: string;
  filename: string;
  mediaType: string;
  contentBase64: string;
  size: number;
}

const IMAGE_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
]);

const DOCUMENT_TYPES = new Set(["application/pdf"]);

const TEXT_EXTENSIONS = new Set([
  "txt", "md", "json", "ts", "tsx", "js", "jsx", "py", "rs", "go",
  "java", "kt", "swift", "rb", "sh", "bash", "zsh", "yaml", "yml",
  "toml", "sql", "html", "css", "scss", "xml", "csv", "log", "env",
  "cfg", "ini", "conf", "dockerfile", "makefile", "gitignore",
]);

export type FileClassification = "image" | "pdf" | "text" | "unsupported";

export function classifyFile(file: File): FileClassification {
  if (IMAGE_TYPES.has(file.type)) return "image";
  if (DOCUMENT_TYPES.has(file.type)) return "pdf";
  if (file.name.endsWith(".pdf")) return "pdf";

  // Check by extension for text files
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (TEXT_EXTENSIONS.has(ext)) return "text";
  if (file.type.startsWith("text/")) return "text";

  return "unsupported";
}

export function getMaxSize(classification: FileClassification): number {
  if (classification === "pdf") return PDF_MAX_SIZE;
  if (classification === "image") return MAX_FILE_SIZE;
  return MAX_FILE_SIZE;
}

export async function fileToAttachment(file: File): Promise<AttachmentDraft | null> {
  const classification = classifyFile(file);
  if (classification === "unsupported" || classification === "text") return null;

  const maxSize = getMaxSize(classification);
  if (file.size > maxSize) return null;

  const base64 = await readFileAsBase64(file);
  return {
    id: crypto.randomUUID(),
    filename: file.name,
    mediaType: file.type || (classification === "pdf" ? "application/pdf" : "application/octet-stream"),
    contentBase64: base64,
    size: file.size,
  };
}

export async function fileTopastedBlock(file: File): Promise<PastedBlock | null> {
  const classification = classifyFile(file);
  if (classification !== "text") return null;
  if (file.size > MAX_FILE_SIZE) return null;

  const text = await file.text();
  const ext = file.name.split(".").pop()?.toLowerCase();
  return createPastedBlock(text, ext);
}

export function createPastedBlock(text: string, ext?: string): PastedBlock {
  const lines = text.split("\n");
  return {
    id: crypto.randomUUID(),
    text,
    lineCount: lines.length,
    charCount: text.length,
    preview: lines.slice(0, 3).join("\n").slice(0, 100),
    ext,
  };
}

export function shouldCompressPaste(text: string): boolean {
  const lines = text.split("\n").length;
  return lines >= PASTE_THRESHOLD_LINES || text.length >= PASTE_THRESHOLD_CHARS;
}

export function draftsToAttachments(drafts: AttachmentDraft[]): AttachmentData[] {
  return drafts.map((d) => ({
    filename: d.filename,
    media_type: d.mediaType,
    content_base64: d.contentBase64,
  }));
}

export function buildFinalText(
  typedText: string,
  pastedBlocks: PastedBlock[]
): string {
  if (pastedBlocks.length === 0) return typedText;

  const blockTexts = pastedBlocks.map((b) => b.text);
  return [...blockTexts, typedText].filter(Boolean).join("\n\n");
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

async function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Strip data:xxx;base64, prefix
      const base64 = result.split(",")[1] ?? result;
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
