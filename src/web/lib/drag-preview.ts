const DEFAULT_DRAG_PREVIEW_ID = '__drag-preview__';
const COLUMN_DRAG_PREVIEW_ID = '__column-drag-preview__';

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

export function clearColumnDragPreview() {
  clearDragPreview(COLUMN_DRAG_PREVIEW_ID);
}

export function setColumnDragPreview(label: string, dataTransfer: DataTransfer) {
  clearColumnDragPreview();
  const ghost = document.createElement('div');
  ghost.textContent = label;
  ghost.style.cssText = `
    padding: 8px 16px;
    background: var(--white, #fff);
    color: var(--text, #1a1a1a);
    font-family: 'Instrument Sans', system-ui, sans-serif;
    font-size: 13px;
    font-weight: 600;
    border-radius: 8px;
    border: 1.5px solid rgba(37, 99, 235, 0.3);
    box-shadow: 0 8px 24px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.06);
    position: fixed;
    top: -999px;
    left: -999px;
    pointer-events: none;
    white-space: nowrap;
  `;
  ghost.id = COLUMN_DRAG_PREVIEW_ID;
  document.body.appendChild(ghost);
  dataTransfer.setDragImage(ghost, ghost.offsetWidth / 2, 20);
}
