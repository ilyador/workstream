import type React from 'react';
import s from './TaskForm.module.css';

interface TaskImagesSectionProps {
  images: string[];
  dragOver: boolean;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onFileSelect: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onRemoveImage: (index: number) => void;
}

export function TaskImagesSection({
  images,
  dragOver,
  fileInputRef,
  onFileSelect,
  onRemoveImage,
}: TaskImagesSectionProps) {
  return (
    <div className={s.imagesSection}>
      <input ref={fileInputRef} type="file" accept="image/*" multiple hidden onChange={onFileSelect} />
      {images.length > 0 && (
        <div className={s.imageGrid}>
          {images.map((url, index) => (
            <div key={index} className={s.imageThumb}>
              <img src={url} alt="" />
              <button type="button" className={s.imageRemove} onClick={() => onRemoveImage(index)}>
                &times;
              </button>
            </div>
          ))}
        </div>
      )}
      <button type="button" className="btn btnGhost btnSm" onClick={() => fileInputRef.current?.click()}>
        + Add images
      </button>
      {dragOver && <div className={s.dragHint}>Drop images anywhere on this form</div>}
    </div>
  );
}
