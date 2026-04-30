import { cn } from '@/lib/utils';

type KalpizWordmarkSvgProps = {
  className?: string;
  title?: string;
};

export function KalpizWordmarkSvg({ className, title = 'Kalpiz' }: KalpizWordmarkSvgProps) {
  return (
    <svg
      className={cn('h-9 w-auto text-primary-foreground', className)}
      viewBox="0 0 260 82"
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
        letterSpacing="-5.2"
      >
        Kalpiz
      </text>
    </svg>
  );
}