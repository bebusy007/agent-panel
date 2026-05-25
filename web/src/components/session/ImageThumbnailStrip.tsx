import { useState } from 'react';
import type { Message } from '@/lib/api';
import { imageUrl } from '@/lib/api';
import { ImageThumbnail } from './ImageThumbnail';
import { ImageLightbox } from './ImageLightbox';

interface Props {
  sessionId: string;
  message: Message;
}

export function ImageThumbnailStrip({ sessionId, message }: Props) {
  const images = message.images;
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  if (!images || images.length === 0) return null;

  const urls = images.map((img) => imageUrl(sessionId, message.id, img.index, img.cachePath));

  return (
    <>
      <div className="mt-2 flex flex-wrap gap-2">
        {images.map((img, i) => {
          const fileName =
            img.cachePath?.split('/').pop() ||
            img.filePath?.split('/').pop() ||
            `image-${img.index}`;
          return (
            <div key={img.index} className="flex flex-col items-start gap-0.5">
              <span className="text-[10px] text-muted-foreground">{fileName}</span>
              <ImageThumbnail
                src={urls[i]!}
                alt={fileName}
                onClick={() => {
                  setLightboxIndex(i);
                  setLightboxOpen(true);
                }}
              />
            </div>
          );
        })}
      </div>
      {lightboxOpen && (
        <ImageLightbox
          open={lightboxOpen}
          onClose={() => setLightboxOpen(false)}
          images={images}
          urls={urls}
          initialIndex={lightboxIndex}
        />
      )}
    </>
  );
}
