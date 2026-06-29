import { LOGO_LIGHT, LOGO_DARK } from "@/lib/logo";
import { useTheme } from "@/hooks/useTheme";

type LogoVariant = "light" | "dark" | "auto";

interface CompanyLogoProps {
  /** "light" = always use light logo (dark bg). "dark" = always use dark logo (light bg). "auto" = pick by app theme. */
  variant?: LogoVariant;
  alt?: string;
  className?: string;
}

export function CompanyLogo({ variant = "auto", alt = "Company logo", className }: CompanyLogoProps) {
  const theme = useTheme();
  const src =
    variant === "light" ? LOGO_LIGHT : variant === "dark" ? LOGO_DARK : theme === "dark" ? LOGO_LIGHT : LOGO_DARK;
  const fallback = src === LOGO_DARK ? LOGO_LIGHT : null;
  return (
    <img
      src={src}
      alt={alt}
      className={className}
      onError={fallback ? (e) => { (e.currentTarget as HTMLImageElement).src = fallback; } : undefined}
    />
  );
}
