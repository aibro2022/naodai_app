import { useEffect, useState } from 'react';

const STORAGE_KEY = 'naodai.model-folder';

export const getModelFolder = (): string => {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? '';
  } catch {
    return '';
  }
};

export const setModelFolder = (value: string): void => {
  try {
    localStorage.setItem(STORAGE_KEY, value);
  } catch {
    // ignore storage errors
  }
};

export const validateModelFolder = (value: string): string | null => {
  const trimmed = value.trim();
  if (!trimmed) {
    return '请选择模型文件夹';
  }
  if (!/^[\x20-\x7E]+$/.test(trimmed)) {
    return '模型文件夹路径必须是英文路径，不能包含中文等其他语言文字';
  }
  return null;
};

export function useModelFolder() {
  const [folder, setFolder] = useState<string>(getModelFolder);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY) {
        setFolder(event.newValue ?? '');
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const updateFolder = (value: string) => {
    setFolder(value);
    setModelFolder(value);
  };

  return { folder, setFolder: updateFolder };
}