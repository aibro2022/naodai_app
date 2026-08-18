import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';

const AVATAR_COLORS = [
  '#ef4444',
  '#f97316',
  '#f59e0b',
  '#84cc16',
  '#10b981',
  '#14b8a6',
  '#3b82f6',
  '#8b5cf6',
  '#ec4899',
];

const colorForName = (name: string): string => {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) | 0;
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
};

export function UserAvatar({
  username,
  className,
}: {
  username: string;
  className?: string;
}) {
  const letter = (username || '?').charAt(0).toUpperCase();
  return (
    <Avatar className={cn('size-6 rounded-lg', className)}>
      <AvatarFallback
        className="text-xs text-white"
        style={{ backgroundColor: colorForName(username) }}
      >
        {letter}
      </AvatarFallback>
    </Avatar>
  );
}