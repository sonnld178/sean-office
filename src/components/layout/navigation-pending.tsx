"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ReactBitsLoaderPanel } from "@/components/ReactBitsLoader";

type NavigationPendingContextValue = {
  isPending: boolean;
  startNavigation: () => void;
};

const NavigationPendingContext =
  createContext<NavigationPendingContextValue | null>(null);

function isInternalNavAnchor(anchor: HTMLAnchorElement) {
  if (anchor.target && anchor.target !== "_self") return false;
  if (anchor.hasAttribute("download")) return false;
  const href = anchor.getAttribute("href");
  if (!href || href.startsWith("#")) return false;
  if (href.startsWith("mailto:") || href.startsWith("tel:")) return false;

  try {
    const url = new URL(anchor.href, window.location.href);
    if (url.origin !== window.location.origin) return false;
    const next = `${url.pathname}${url.search}`;
    const current = `${window.location.pathname}${window.location.search}`;
    return next !== current;
  } catch {
    return false;
  }
}

export function NavigationPendingProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [isPending, setIsPending] = useState(false);

  const startNavigation = useCallback(() => {
    setIsPending(true);
  }, []);

  useEffect(() => {
    setIsPending(false);
  }, [pathname]);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        return;
      }
      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest("a");
      if (!(anchor instanceof HTMLAnchorElement)) return;
      if (!isInternalNavAnchor(anchor)) return;
      setIsPending(true);
    };

    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  // Safety: never leave the UI stuck in pending forever
  useEffect(() => {
    if (!isPending) return;
    const timer = window.setTimeout(() => setIsPending(false), 12000);
    return () => window.clearTimeout(timer);
  }, [isPending]);

  const value = useMemo(
    () => ({ isPending, startNavigation }),
    [isPending, startNavigation]
  );

  return (
    <NavigationPendingContext.Provider value={value}>
      {children}
    </NavigationPendingContext.Provider>
  );
}

export function useNavigationPending() {
  const ctx = useContext(NavigationPendingContext);
  if (!ctx) {
    return {
      isPending: false,
      startNavigation: () => {},
    };
  }
  return ctx;
}

export function usePendingRouter() {
  const router = useRouter();
  const { startNavigation } = useNavigationPending();

  return useMemo(
    () => ({
      push: (href: string) => {
        startNavigation();
        router.push(href);
      },
      replace: (href: string) => {
        startNavigation();
        router.replace(href);
      },
      back: () => {
        startNavigation();
        router.back();
      },
      prefetch: router.prefetch.bind(router),
      refresh: router.refresh.bind(router),
    }),
    [router, startNavigation]
  );
}

export function ContentRouteLoading() {
  const t = useTranslations("common");

  return <ReactBitsLoaderPanel label={t("navigating")} />;
}
