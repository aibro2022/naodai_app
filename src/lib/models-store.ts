import { useCallback, useEffect, useRef, useState } from 'react';
import type { ModelsPagedParams, ModelsPagedResult } from '@/ipc';
import { formatErrorMessage } from '@/lib/utils';

const PAGE_SIZE = 3;

export function useModelsCatalog() {
  const [result, setResult] = useState<ModelsPagedResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [params, setParams] = useState<ModelsPagedParams>({
    page: 1,
    pageSize: PAGE_SIZE,
  });
  const [nameInput, setNameInput] = useState('');
  const [typeValue, setTypeValue] = useState<number | undefined>(undefined);
  const latestParamsRef = useRef<ModelsPagedParams>(params);

  const fetchData = useCallback(async (next: ModelsPagedParams) => {
    latestParamsRef.current = next;
    setLoading(true);
    setError(null);
    try {
      const data = await window.api.fetchModelsPaged(next);
      if (latestParamsRef.current === next) {
        setResult(data);
      }
    } catch (err) {
      if (latestParamsRef.current === next) {
        setError(formatErrorMessage(err, '获取模型列表失败，请稍后重试'));
      }
    } finally {
      setLoading(false);
    }
  }, []);

  // 打开 app 时先展示本地缓存，再拉取最新数据并保存到本地。
  useEffect(() => {
    window.api.readModelsCache().then((cached) => {
      if (cached) {
        setResult(cached);
      }
    });
  }, []);

  // name 输入防抖，300ms 后触发过滤。
  useEffect(() => {
    const timer = setTimeout(() => {
      setParams((prev) => {
        const nextName = nameInput.trim() || undefined;
        if (prev.name === nextName) {
          return prev;
        }
        return { ...prev, page: 1, name: nextName };
      });
    }, 300);
    return () => clearTimeout(timer);
  }, [nameInput]);

  const setType = useCallback((type: number | undefined) => {
    setTypeValue(type);
    setParams((prev) => {
      if (prev.type === type) {
        return prev;
      }
      return { ...prev, page: 1, type };
    });
  }, []);

  const goToPage = useCallback((page: number) => {
    setParams((prev) => ({ ...prev, page }));
  }, []);

  useEffect(() => {
    fetchData(params);
  }, [params, fetchData]);

  const refresh = useCallback(() => {
    fetchData(params);
  }, [params, fetchData]);

  return {
    result,
    loading,
    error,
    name: nameInput,
    setName: setNameInput,
    type: typeValue,
    setType,
    goToPage,
    refresh,
  };
}

export type ModelsCatalog = ReturnType<typeof useModelsCatalog>;
