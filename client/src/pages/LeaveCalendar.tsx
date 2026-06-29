import { useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

export default function LeaveCalendar() {
  const [, setLocation] = useLocation();
  const { data: me } = useQuery<any>({
    queryKey: ["/api/auth/me"],
    queryFn: async () => {
      try {
        const r = await apiRequest("GET", "/api/auth/me");
        return r.json();
      } catch {
        return null;
      }
    },
  });

  useEffect(() => {
    if (!me) return;
    const role: string = (me?.role || "employee").toString().toLowerCase();
    const roles: string[] = Array.isArray(me?.roles)
      ? me.roles.map((r: unknown) => String(r).toLowerCase())
      : [];
    const isAdminUser =
      role === "hr" ||
      role === "admin" ||
      role === "manager" ||
      roles.includes("hr") ||
      roles.includes("admin") ||
      roles.includes("manager");
    const qs = typeof window !== "undefined" ? window.location.search : "";
    const base = isAdminUser ? "/leave/admin" : "/leave/employee";
    setLocation(qs ? `${base}${qs}` : base);
  }, [me, setLocation]);

  return null;
}
