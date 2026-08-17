import { useEffect, useState } from 'react';

export const getModelFolder = async (): Promise<string> => {
  const config = await window.api.getConfig();
  return config.modelFolder ?? '';
};

export const setModelFolder = async (value: string): Promise<void> => {
  await window.api.updateConfig({ modelFolder: value });
};

const KB = 1024;
const MB = 1024 * 1024;

// 4K, 8K, 16K, 32K, 64K, 128K, 256K, 512K, 1M.
export const CONTEXT_SIZE_VALUES: number[] = [
  4 * KB,
  8 * KB,
  16 * KB,
  32 * KB,
  64 * KB,
  128 * KB,
  256 * KB,
  512 * KB,
  1 * MB,
];

export const DEFAULT_CONTEXT_SIZE_INDEX = 0;

export const formatContextSize = (bytes: number): string => {
  if (bytes >= MB) {
    return `${bytes / MB} MB`;
  }
  return `${bytes / KB} KB`;
};

const nearestContextIndex = (bytes: number): number => {
  return CONTEXT_SIZE_VALUES.reduce(
    (best, value, index) =>
      Math.abs(value - bytes) < Math.abs(CONTEXT_SIZE_VALUES[best] - bytes)
        ? index
        : best,
    0,
  );
};

export const getContextSizeBytes = async (): Promise<number> => {
  const config = await window.api.getConfig();
  return (
    config.contextSizeBytes ?? CONTEXT_SIZE_VALUES[DEFAULT_CONTEXT_SIZE_INDEX]
  );
};

export const setContextSizeBytes = async (bytes: number): Promise<void> => {
  await window.api.updateConfig({ contextSizeBytes: bytes });
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

export function useContextSize() {
  const [value, setValue] = useState<number>(
    CONTEXT_SIZE_VALUES[DEFAULT_CONTEXT_SIZE_INDEX],
  );

  useEffect(() => {
    let cancelled = false;
    getContextSizeBytes().then((saved) => {
      if (!cancelled) {
        setValue(CONTEXT_SIZE_VALUES[nearestContextIndex(saved)]);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const updateValue = (next: number) => {
    setValue(next);
    setContextSizeBytes(next);
  };

  return { value, setValue: updateValue };
}
