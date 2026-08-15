import { useEffect, useState } from 'react';

export const getModelFolder = async (): Promise<string> => {
  const config = await window.api.getConfig();
  return config.modelFolder ?? '';
};

export const setModelFolder = async (value: string): Promise<void> => {
  await window.api.updateConfig({ modelFolder: value });
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
  const [folder, setFolder] = useState<string>('');

  useEffect(() => {
    let cancelled = false;
    getModelFolder().then((value) => {
      if (!cancelled) {
        setFolder(value);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const updateFolder = (value: string) => {
    setFolder(value);
    setModelFolder(value);
  };

  return { folder, setFolder: updateFolder };
}
