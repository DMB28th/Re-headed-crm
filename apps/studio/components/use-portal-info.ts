"use client";
/**
 * Portal-level facts for client surfaces (GET /api/portal-info). Every field
 * degrades to null/[] when the route or the CRM can't answer — callers must
 * drop numbers from copy rather than invent them.
 */
import { useEffect, useState } from "react";

export interface PortalInfo {
  userCount: number | null;
  portalId: string | null;
  defaultCurrency: string | null;
  /** Salesforce Organization.IsSandbox; absent for HubSpot / unknown. */
  isSandbox?: boolean | null;
  scopeGaps: string[];
}

const EMPTY: PortalInfo = { userCount: null, portalId: null, defaultCurrency: null, scopeGaps: [] };

export function usePortalInfo(): { info: PortalInfo; loaded: boolean } {
  const [info, setInfo] = useState<PortalInfo>(EMPTY);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/portal-info");
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as Partial<PortalInfo>;
        if (cancelled) return;
        setInfo({
          userCount: typeof data.userCount === "number" ? data.userCount : null,
          portalId: typeof data.portalId === "string" ? data.portalId : null,
          defaultCurrency: typeof data.defaultCurrency === "string" ? data.defaultCurrency : null,
          scopeGaps: Array.isArray(data.scopeGaps) ? data.scopeGaps.map(String) : [],
        });
        setLoaded(true);
      } catch {
        // Route unavailable / CRM hiccup — callers render number-free copy.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return { info, loaded };
}
