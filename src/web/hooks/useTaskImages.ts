import { useRef, useState } from 'react';

const MAX_IMAGE_SIZE = 5 * 1024 * 1024;

interface UseTaskImagesArgs {
  initialImages?: string[];
  onError: (message: string) => void;
}

export function useTaskImages({ initialImages = [], onError }: UseTaskImagesArgs) {
  const [images, setImages] = useState<string[]>(initialImages);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const addFiles = (files: File[]) => {
    for (const file of files) {
      if (file.size > MAX_IMAGE_SIZE) {
        onError('Image too large (max 5MB)');
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        setImages(current => [...current, reader.result as string]);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleImageDrop = (event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    const files = Array.from(event.dataTransfer.files).filter(file => file.type.startsWith('image/'));
    addFiles(files);
  };

  const handleImagePaste = (event: React.ClipboardEvent) => {
    const files = Array.from(event.clipboardData.items)
      .filter(item => item.type.startsWith('image/'))
      .map(item => item.getAsFile())
      .filter((file): file is File => Boolean(file));
    addFiles(files);
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []).filter(file => file.type.startsWith('image/'));
    addFiles(files);
  };

  const removeImage = (index: number) => {
    setImages(current => current.filter((_, currentIndex) => currentIndex !== index));
  };

  return {
    images,
    dragOver,
    fileInputRef,
    setDragOver,
    handleImageDrop,
    handleImagePaste,
    handleFileSelect,
    removeImage,
  };
}
