import { cn } from '@/lib/utils';

type RealtyzWordmarkSvgProps = {
  className?: string;
  title?: string;
};

export function RealtyzWordmarkSvg({ className, title = 'Realtyz AI' }: RealtyzWordmarkSvgProps) {
  return (
    <svg
      className={cn('h-9 w-auto text-primary-foreground', className)}
      viewBox="0 0 320 82"
      role="img"
      aria-label={title}
      xmlns="http://www.w3.org/2000/svg"
    >
      <title>{title}</title>
      <text
        x="10"
        y="58"
        fill="currentColor"
        fontFamily="Inter, Assistant, Heebo, Arial, sans-serif"
        fontSize="56"
        fontWeight="900"
        letterSpacing="-4"
      >
        Realtyz AI
      </text>
    </svg>
  );
}