import { RealtyzWordmarkSvg } from '@/components/RealtyzWordmarkSvg';

export function RealtyzLoader({ size = 'md', label }: { size?: 'sm' | 'md' | 'lg'; label?: string }) {
  const sizeMap = { sm: 'h-6 w-6', md: 'h-10 w-10', lg: 'h-16 w-16' };
  const logoMap = { sm: 'h-2.5 w-8', md: 'h-4 w-12', lg: 'h-6 w-20' };

  return (
    <div className="flex flex-col items-center gap-3">
      <div className={`relative ${sizeMap[size]} flex items-center justify-center`}>
        <div className={`absolute inset-0 rounded-full border-2 border-transparent border-t-primary border-r-primary animate-spin`} />
        <RealtyzWordmarkSvg className={`text-primary ${logoMap[size]} animate-realtyz-pulse`} title="Realtyz AI" />
      </div>
      {label && <p className="text-xs text-muted-foreground animate-pulse">{label}</p>}
    </div>
  );
}
