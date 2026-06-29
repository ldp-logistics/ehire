import { useEffect, useRef, useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

type EmployeeAvatarProps = {
  employeeId: string;
  avatarFromList?: string | null;
  fallbackInitials: string;
  className?: string;
  fallbackClassName?: string;
};

/** Loads employee photo via authenticated fetch (blob URL) with initials fallback. */
export function EmployeeAvatar({
  employeeId,
  avatarFromList,
  fallbackInitials,
  className,
  fallbackClassName,
}: EmployeeAvatarProps) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const blobUrlRef = useRef<string | null>(null);

  useEffect(() => {
    if (avatarFromList && avatarFromList.startsWith("data:")) {
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
      setBlobUrl(null);
      return;
    }
    let cancelled = false;
    const url = `/api/employees/${employeeId}/avatar`;
    fetch(url, { credentials: "include" })
      .then((res) => (res.ok ? res.blob() : null))
      .then((blob) => {
        if (cancelled || !blob) return;
        if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
        const objectUrl = URL.createObjectURL(blob);
        blobUrlRef.current = objectUrl;
        setBlobUrl(objectUrl);
      })
      .catch(() => setBlobUrl(null));
    return () => {
      cancelled = true;
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
      setBlobUrl(null);
    };
  }, [employeeId, avatarFromList]);

  const src = avatarFromList && avatarFromList.startsWith("data:") ? avatarFromList : blobUrl ?? undefined;

  return (
    <Avatar className={className}>
      <AvatarImage src={src} alt="" className="object-cover" />
      <AvatarFallback className={cn("bg-muted text-muted-foreground font-semibold text-xs", fallbackClassName)}>
        {fallbackInitials}
      </AvatarFallback>
    </Avatar>
  );
}

export function employeeInitials(first?: string | null, last?: string | null): string {
  return `${first?.[0] ?? ""}${last?.[0] ?? ""}`.toUpperCase() || "?";
}
