import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * 从 IPC 调用抛出的错误中提取直白的中文提示。
 * Electron 会把主进程抛出的 Error 包一层前缀
 * （"Error invoking remote method 'channel': message"），这里去掉该前缀。
 */
export function formatErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) {
    const message = error.message.replace(
      /^Error invoking remote method '[^']+':\s*/,
      '',
    );
    return message.trim() || fallback;
  }
  return fallback;
}