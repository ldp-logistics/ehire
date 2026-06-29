import { useEffect, useState } from "react";
import { getRegionView, REGION_VIEW_CHANGED } from "@/lib/queryClient";

/** Active Super Region filter from the top nav (null = all regions). */
export function useRegionView(): string | null {
  const [view, setView] = useState<string | null>(() => getRegionView());

  useEffect(() => {
    const onChange = (e: Event) => {
      const detail = (e as CustomEvent<string | null>).detail;
      setView(detail ?? getRegionView());
    };
    window.addEventListener(REGION_VIEW_CHANGED, onChange);
    return () => window.removeEventListener(REGION_VIEW_CHANGED, onChange);
  }, []);

  return view;
}
