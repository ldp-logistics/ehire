import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

type BreadcrumbContextValue = {
  /** Custom label for the current page (e.g. employee name). When set, Layout shows this instead of the path segment. */
  breadcrumbLabel: string | null;
  setBreadcrumbLabel: (label: string | null) => void;
};

const BreadcrumbContext = createContext<BreadcrumbContextValue | null>(null);

export function BreadcrumbProvider({ children }: { children: ReactNode }) {
  const [breadcrumbLabel, setBreadcrumbLabelState] = useState<string | null>(null);
  const setBreadcrumbLabel = useCallback((label: string | null) => {
    setBreadcrumbLabelState(label);
  }, []);
  return (
    <BreadcrumbContext.Provider value={{ breadcrumbLabel, setBreadcrumbLabel }}>
      {children}
    </BreadcrumbContext.Provider>
  );
}

export function useBreadcrumb() {
  const ctx = useContext(BreadcrumbContext);
  if (!ctx) return { breadcrumbLabel: null, setBreadcrumbLabel: () => {} };
  return ctx;
}
