import { readConfig, updateConfig } from './config';
import type {
  Account,
  AuthSession,
  LauncherVersion,
  LauncherVersionFilterParams,
  ModelsPagedParams,
  ModelsPagedResult,
  RegisterPayload,
} from './ipc';

const DEFAULT_BASE_URL = 'http://localhost:3000';
const CONNECTION_ERROR = '无法连接服务器，请确认网络连接后重试';

export const getBaseUrl = (): string =>
  readConfig().apiBaseUrl ?? DEFAULT_BASE_URL;

const getToken = (): string | null => readConfig().auth?.token ?? null;

interface ApiErrorBody {
  statusCode?: number;
  message?: string | string[];
}

interface ApiError extends Error {
  status?: number;
  body?: ApiErrorBody;
}

const parseError = (response: Response, text: string): ApiError => {
  let body: ApiErrorBody | undefined;
  try {
    body = JSON.parse(text) as ApiErrorBody;
  } catch {
    body = undefined;
  }
  const message =
    typeof body?.message === 'string'
      ? body.message
      : Array.isArray(body?.message)
        ? body.message.join('；')
        : text;
  const error = new Error(message || `HTTP ${response.status}`) as ApiError;
  error.status = response.status;
  error.body = body;
  return error;
};

const request = async <T>(
  path: string,
  init: RequestInit = {},
  token: string | null,
): Promise<T> => {
  const headers = new Headers(init.headers);
  headers.set('Content-Type', 'application/json');
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  const isGet = (init.method ?? 'GET').toUpperCase() === 'GET';
  let attempt = 0;
  let response: Response;
  for (;;) {
    try {
      response = await fetch(`${getBaseUrl()}${path}`, { ...init, headers });
      break;
    } catch (err) {
      // 网络层偶发失败（fetch failed），GET 请求退避重试。
      if (!isGet || attempt >= 3) {
        throw err;
      }
      attempt++;
      await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
    }
  }
  const text = await response.text();
  if (!response.ok) {
    throw parseError(response, text);
  }
  if (!text) {
    return undefined as T;
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    return text as T;
  }
};

/**
 * 将接口报错转换为直白的中文提示。未连接成功（无 status）视为网络/服务不可用。
 */
const toFriendlyError = (
  err: unknown,
  statusMap: Record<number, string>,
  fallback: string,
): Error => {
  if (err instanceof Error && 'status' in err) {
    const { status, body } = err as ApiError;
    if (!status) {
      return new Error(CONNECTION_ERROR);
    }
    const mapped = statusMap[status];
    if (mapped) {
      return new Error(mapped);
    }
    if (typeof body?.message === 'string') {
      return new Error(body.message);
    }
    return new Error(fallback);
  }
  return new Error(CONNECTION_ERROR);
};

export const authLogin = async (
  username: string,
  password: string,
): Promise<AuthSession> => {
  const session = await request<AuthSession>(
    '/auth/login',
    {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    },
    null,
  ).catch((err: unknown) => {
    throw toFriendlyError(err, {
      401: '用户名或密码错误',
      400: '请输入有效的用户名和密码',
    }, '登录失败，请稍后重试');
  });
  updateConfig({ auth: session });
  return session;
};

export const authLogout = async (): Promise<void> => {
  try {
    await request<{ success: boolean }>(
      '/auth/logout',
      { method: 'POST' },
      getToken(),
    );
  } finally {
    updateConfig({ auth: undefined });
  }
};

export const authProfile = async (): Promise<Account> => {
  const data = await request<Account | { account: Account }>(
    '/auth/profile',
    {},
    getToken(),
  ).catch((err: unknown) => {
    throw toFriendlyError(err, {
      401: '登录已失效，请重新登录',
    }, '获取登录信息失败，请重试');
  });
  if (data && typeof data === 'object' && 'account' in data) {
    return data.account;
  }
  return data as Account;
};

export const authRegister = async (payload: RegisterPayload): Promise<void> => {
  await request<unknown>(
    '/auth/register',
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
    null,
  ).catch((err: unknown) => {
    throw toFriendlyError(err, {
      409: '用户名或邮箱已被注册',
      400: '请输入有效的用户名和密码',
    }, '注册失败，请稍后重试');
  });
};

export const fetchModelsPaged = async (
  params: ModelsPagedParams,
): Promise<ModelsPagedResult> => {
  const token = getToken();
  if (!token) {
    throw new Error('获取最新可用模型需要先登录');
  }
  const query = new URLSearchParams();
  query.set('page', String(params.page ?? 1));
  query.set('pageSize', String(params.pageSize ?? 3));
  if (params.name) {
    query.set('name', params.name);
  }
  if (params.type != null) {
    query.set('type', String(params.type));
  }
  return request<ModelsPagedResult>(
    `/models/paged?${query.toString()}`,
    {},
    token,
  ).catch((err: unknown) => {
    throw toFriendlyError(err, {
      401: '登录已失效，请先登录',
      404: '未找到模型数据',
    }, '获取模型列表失败，请稍后重试');
  });
};

export const fetchLauncherVersionsFilter = async (
  params: LauncherVersionFilterParams,
): Promise<LauncherVersion[]> => {
  const token = getToken();
  if (!token) {
    throw new Error('请先登录后再获取启动器版本');
  }
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value != null) {
      query.set(key, String(value));
    }
  }
  const url = `/launcher-versions/filter?${query.toString()}`;
  // console.log(`[launcher-versions/filter] 请求参数:`, params);
  const data = await request<unknown>(
    url,
    {},
    token,
  ).catch((err: unknown) => {
    console.error(`[launcher-versions/filter] 请求失败 ${url}`, err);
    throw toFriendlyError(err, {
      401: '登录已失效，请先登录',
    }, '获取启动器版本失败，请稍后重试');
  });
  // console.log(`[launcher-versions/filter] 响应:`, data);
  if (Array.isArray(data)) {
    return data as LauncherVersion[];
  }
  return [];
};
