import { cn } from "@/lib/utils";

interface SeanOfficeLogoProps {
  className?: string;
  size?: number;
  showWordmark?: boolean;
}

/** Stacked-doc office mark — matches app/icon.svg */
export function SeanOfficeLogo({
  className,
  size = 24,
  showWordmark = false,
}: SeanOfficeLogoProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 leading-none",
        className
      )}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 32 32"
        width={size}
        height={size}
        fill="none"
        className="block shrink-0"
        aria-hidden={showWordmark}
        role={showWordmark ? undefined : "img"}
        aria-label={showWordmark ? undefined : "SeanOffice"}
      >
        <rect width="32" height="32" rx="8" fill="#0078D4" />
        <rect x="7" y="6" width="15" height="19" rx="2" fill="#ffffff" opacity="0.28" />
        <rect x="9" y="8" width="15" height="19" rx="2" fill="#ffffff" opacity="0.55" />
        <rect x="11" y="10" width="15" height="19" rx="2" fill="#ffffff" />
        <path
          d="M14 15h9M14 18.5h7M14 22h5"
          stroke="#0078D4"
          strokeWidth="1.75"
          strokeLinecap="round"
        />
        <path
          d="M11 10h4.5l1.5 1.5V10"
          fill="#E8F3FC"
          stroke="#0078D4"
          strokeWidth="0.75"
          strokeLinejoin="round"
        />
      </svg>
      {showWordmark && (
        <span className="text-[15px] font-semibold leading-none tracking-tight">
          seanoffice
        </span>
      )}
    </span>
  );
}
