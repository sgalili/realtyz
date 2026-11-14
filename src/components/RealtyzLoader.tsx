import { ToraffLoader } from '@/components/ui/toraff-loader';

export function RealtyzLoader({ size = 'md', label }: { size?: 'sm' | 'md' | 'lg'; label?: string }) {
  return (
    <div className="flex flex-col items-center gap-3">
      <ToraffLoader className={`toraff-loader-${size}`} />
      {label && <p className="text-xs text-muted-foreground">{label}</p>}
    </div>
  );
}
