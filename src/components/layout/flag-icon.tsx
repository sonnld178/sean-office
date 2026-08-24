import type { Locale } from "@/i18n/routing";
import { cn } from "@/lib/utils";

interface FlagIconProps {
  locale: Locale;
  className?: string;
}

/** SVG flags — emoji flags render as text on Windows */
export function FlagIcon({ locale, className }: FlagIconProps) {
  if (locale === "vi") {
    return (
      <svg
        viewBox="0 0 24 16"
        className={cn(
          "h-3.5 w-5 shrink-0 rounded-[2px] border border-black/10",
          className
        )}
        aria-hidden
      >
        <rect width="24" height="16" fill="#DA251D" />
        <path
          fill="#FFCD00"
          d="M12 3.2l1.76 5.42h5.7l-4.61 3.35 1.76 5.42L12 14.04l-4.61 3.35 1.76-5.42-4.61-3.35h5.7z"
        />
      </svg>
    );
  }

  return (
    <svg
      viewBox="0 0 24 16"
      className={cn(
        "h-3.5 w-5 shrink-0 rounded-[2px] border border-black/10",
        className
      )}
      aria-hidden
    >
      <rect width="24" height="16" fill="#B22234" />
      {[0, 1, 2, 3, 4, 5, 6].map((i) => (
        <rect key={i} y={i * 2.29 + 1.14} width="24" height="1.14" fill="#fff" />
      ))}
      <rect width="9.6" height="8.6" fill="#3C3B6E" />
    </svg>
  );
}
