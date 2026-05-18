import { useState } from "react";
import { ImageOff } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  src: string;
  alt: string;
  onClick: () => void;
  className?: string;
}

export function ImageThumbnail({ src, alt, onClick, className }: Props) {
  const [status, setStatus] = useState<"loading" | "loaded" | "error">("loading");

  if (status === "error") {
    return (
      <div
        className={cn(
          "flex h-[80px] w-[120px] flex-col items-center justify-center gap-1 rounded-md border border-dashed border-border bg-muted/30",
          className,
        )}
        title={alt}
      >
        <ImageOff className="size-5 text-muted-foreground" />
        <span className="text-[10px] text-muted-foreground">图片不可用</span>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      onClick={onClick}
      onLoad={() => setStatus("loaded")}
      onError={() => setStatus("error")}
      className={cn(
        "max-h-[160px] max-w-[240px] cursor-pointer rounded-md border border-border object-contain transition-opacity hover:opacity-90",
        status === "loading" && "animate-pulse bg-muted/30",
        className,
      )}
    />
  );
}
