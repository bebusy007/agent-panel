import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { COPY_FEEDBACK_MS } from "@/lib/constants";
import {
  X,
  Download,
  ZoomIn,
  ZoomOut,
  Maximize,
  ChevronLeft,
  ChevronRight,
  Copy,
  Check,
  FolderOpen,
} from "lucide-react";
import { cn, copyToClipboard } from "@/lib/utils";
import { api } from "@/lib/api";
import type { ImageMeta } from "@/lib/api";

interface Props {
  open: boolean;
  onClose: () => void;
  images: ImageMeta[];
  urls: string[];
  initialIndex: number;
}

const MIN_SCALE = 0.25;
const MAX_SCALE = 5.0;
const SCALE_STEP = 0.2;

export function ImageLightbox({ open, onClose, images, urls, initialIndex }: Props) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [copied, setCopied] = useState(false);
  const dragStart = useRef({ x: 0, y: 0, posX: 0, posY: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  const total = images.length;
  const currentImage = images[currentIndex]!;
  const currentUrl = urls[currentIndex]!;
  const sourcePath = currentImage.cachePath || currentImage.filePath || "";

  const resetView = useCallback(() => {
    setScale(1);
    setPosition({ x: 0, y: 0 });
  }, []);

  const navigate = useCallback(
    (dir: 1 | -1) => {
      const next = currentIndex + dir;
      if (next >= 0 && next < total) {
        setCurrentIndex(next);
        resetView();
      }
    },
    [currentIndex, total, resetView],
  );

  const zoom = useCallback(
    (delta: number) => {
      setScale((s) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, s + delta)));
    },
    [],
  );

  const fitToScreen = useCallback(() => {
    setScale(1);
    setPosition({ x: 0, y: 0 });
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      switch (e.key) {
        case "Escape":
          onClose();
          break;
        case "ArrowLeft":
          navigate(-1);
          break;
        case "ArrowRight":
          navigate(1);
          break;
        case "+":
        case "=":
          zoom(SCALE_STEP);
          break;
        case "-":
          zoom(-SCALE_STEP);
          break;
        case "0":
          fitToScreen();
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, navigate, zoom, fitToScreen]);

  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY < 0 ? SCALE_STEP : -SCALE_STEP;
      zoom(delta);
    },
    [zoom],
  );

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (scale <= 1) return;
      setIsDragging(true);
      dragStart.current = { x: e.clientX, y: e.clientY, posX: position.x, posY: position.y };
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    },
    [scale, position],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!isDragging) return;
      const dx = e.clientX - dragStart.current.x;
      const dy = e.clientY - dragStart.current.y;
      setPosition({ x: dragStart.current.posX + dx, y: dragStart.current.posY + dy });
    },
    [isDragging],
  );

  const handlePointerUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleDoubleClick = useCallback(() => {
    if (scale === 1) {
      setScale(2);
    } else {
      fitToScreen();
    }
  }, [scale, fitToScreen]);

  const handleCopyPath = useCallback(() => {
    if (!sourcePath) return;
    copyToClipboard(sourcePath);
    setCopied(true);
    setTimeout(() => setCopied(false), COPY_FEEDBACK_MS);
  }, [sourcePath]);

  const downloadName = sourcePath
    ? sourcePath.split("/").pop() || `image-${currentImage.index}.png`
    : `image-${currentImage.index}.png`;

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex flex-col" onClick={onClose}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" />

      {/* Toolbar */}
      <div
        className="relative z-10 flex items-center gap-3 bg-black/40 px-4 py-2 text-white/80"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="text-xs font-medium">
          {downloadName}
        </span>
        {sourcePath && (
          <button
            onClick={handleCopyPath}
            className="flex min-w-0 items-center gap-1 text-[11px] text-white/50 hover:text-white/80 transition-colors"
            title="点击复制路径"
          >
            <span className="truncate">{sourcePath}</span>
            {copied ? <Check className="size-3 shrink-0 text-emerald-400" /> : <Copy className="size-3 shrink-0" />}
          </button>
        )}
        <span className="shrink-0 text-[11px] text-white/40 uppercase">{currentImage.mediaType.split("/")[1]}</span>
        <span className="flex-1" />
        {sourcePath && (
          <button
            onClick={() => api.openFolder(sourcePath).catch(() => {})}
            className="rounded p-1 hover:bg-white/10 transition-colors"
            title="在 Finder 中打开"
          >
            <FolderOpen className="size-4" />
          </button>
        )}
        <a
          href={currentUrl}
          download={downloadName}
          className="rounded p-1 hover:bg-white/10 transition-colors"
          title="另存为"
          onClick={(e) => e.stopPropagation()}
        >
          <Download className="size-4" />
        </a>
        <button
          onClick={onClose}
          className="rounded p-1 hover:bg-white/10 transition-colors"
          title="关闭"
        >
          <X className="size-4" />
        </button>
      </div>

      {/* Image area */}
      <div
        ref={containerRef}
        className="relative z-10 flex flex-1 items-center justify-center overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        onWheel={handleWheel}
      >
        <img
          src={currentUrl}
          alt={`图片 ${currentIndex + 1}`}
          draggable={false}
          className={cn(
            "max-h-full max-w-full select-none transition-transform duration-100",
            scale > 1 ? "cursor-grab" : "cursor-zoom-in",
            isDragging && "cursor-grabbing",
          )}
          style={{
            transform: `scale(${scale}) translate(${position.x / scale}px, ${position.y / scale}px)`,
          }}
          onDoubleClick={handleDoubleClick}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
        />

        {/* Navigation arrows */}
        {total > 1 && currentIndex > 0 && (
          <button
            onClick={(e) => { e.stopPropagation(); navigate(-1); }}
            className="absolute left-4 rounded-full bg-black/40 p-2 text-white/70 hover:bg-black/60 hover:text-white transition-colors"
          >
            <ChevronLeft className="size-6" />
          </button>
        )}
        {total > 1 && currentIndex < total - 1 && (
          <button
            onClick={(e) => { e.stopPropagation(); navigate(1); }}
            className="absolute right-4 rounded-full bg-black/40 p-2 text-white/70 hover:bg-black/60 hover:text-white transition-colors"
          >
            <ChevronRight className="size-6" />
          </button>
        )}
      </div>

      {/* Bottom controls */}
      <div
        className="relative z-10 flex items-center justify-between bg-black/40 px-4 py-2"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Scale display */}
        <span className="text-[11px] tabular-nums text-white/60">
          {Math.round(scale * 100)}%
        </span>

        {/* Page indicator */}
        {total > 1 && (
          <span className="text-[11px] tabular-nums text-white/50">
            {currentIndex + 1} / {total}
          </span>
        )}

        {/* Zoom controls */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => zoom(-SCALE_STEP)}
            className="rounded p-1 text-white/60 hover:bg-white/10 hover:text-white transition-colors"
            title="缩小"
          >
            <ZoomOut className="size-4" />
          </button>
          <button
            onClick={fitToScreen}
            className="rounded p-1 text-white/60 hover:bg-white/10 hover:text-white transition-colors"
            title="适应窗口"
          >
            <Maximize className="size-4" />
          </button>
          <button
            onClick={() => zoom(SCALE_STEP)}
            className="rounded p-1 text-white/60 hover:bg-white/10 hover:text-white transition-colors"
            title="放大"
          >
            <ZoomIn className="size-4" />
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
