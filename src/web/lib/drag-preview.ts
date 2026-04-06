const DEFAULT_DRAG_PREVIEW_ID = '__drag-preview__';

export function clearDragPreview(id: string = DEFAULT_DRAG_PREVIEW_ID) {
  document.getElementById(id)?.remove();
}

export function setClonedDragPreview(
  source: HTMLElement,
  dataTransfer: DataTransfer,
  id: string = DEFAULT_DRAG_PREVIEW_ID,
) {
  clearDragPreview(id);
  const clone = source.cloneNode(true) as HTMLElement;
  clone.style.width = `${source.offsetWidth}px`;
  clone.style.transform = 'rotate(2deg) scale(1.02)';
  clone.style.boxShadow = '0 12px 32px rgba(0,0,0,0.18), 0 4px 12px rgba(0,0,0,0.1)';
  clone.style.borderRadius = '10px';
  clone.style.opacity = '0.92';
  clone.style.position = 'fixed';
  clone.style.top = '-9999px';
  clone.style.left = '-9999px';
  clone.style.pointerEvents = 'none';
  clone.id = id;
  document.body.appendChild(clone);
  dataTransfer.setDragImage(clone, source.offsetWidth / 2, 20);
}
