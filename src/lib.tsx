import {
  createContext,
  useContext,
  useState,
  useEffect,
  type ReactNode,
} from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { en, kk } from "./translations";
export type Tier = "free" | "premium" | "premium_plus" | "elite";
export type Profile = {
  id: string;
  username: string;
  display_name: string;
  bio: string;
  avatar_id: string | null;
  banner_id: string | null;
  status: string;
  website: string;
  style: string;
  private: number;
  allow_messages: string;
  created_at: number;
  followers: number;
  following: number;
  post_count: number;
  is_following: number;
  tier: Tier;
  role: "user" | "moderator" | "administrator" | "owner";
  badges: string;
  banned_until?: number | null;
};
export type Post = {
  id: string;
  user_id: string;
  username: string;
  display_name: string;
  avatar_id: string | null;
  tier: Tier;
  content: string;
  created_at: number;
  edited_at: number | null;
  parent_id: string | null;
  quote_id: string | null;
  pinned: number;
  likes: number;
  replies: number;
  reposts: number;
  liked: number;
  reposted: number;
  bookmarked: number;
  media: string;
  reply_permission: string;
};
export type Settings = {
  language: "ru" | "en" | "kk";
  theme: "dark" | "light" | "system";
  hide_seen: boolean;
  notifications: boolean;
  reduced_motion: boolean;
};
export type Me = {
  user: Profile | null;
  csrf: string | null;
  settings: Settings | null;
};
let csrf: string | null = null;
export async function api<T = Record<string, unknown>>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const form = body instanceof FormData;
  const res = await fetch(`/api${path}`, {
    method,
    credentials: "same-origin",
    headers: {
      ...(!form ? { "Content-Type": "application/json" } : {}),
      ...(csrf ? { "X-CSRF-Token": csrf } : {}),
    },
    ...(method !== "GET"
      ? { body: form ? body : JSON.stringify(body ?? {}) }
      : {}),
  });
  const data = (await res.json()) as T & { error?: string };
  if (!res.ok) throw new Error(data.error ?? "Не удалось выполнить запрос");
  return data;
}
const initial: Settings = {
  language: "ru",
  theme: "dark",
  hide_seen: false,
  notifications: true,
  reduced_motion: false,
};
type UI = {
  user: Profile | null;
  loading: boolean;
  settings: Settings;
  t: (s: string) => string;
  notice: (s: string) => void;
  authenticate: () => void;
  setAuth: (value: boolean) => void;
  authOpen: boolean;
  refresh: () => Promise<void>;
  saveSettings: (s: Settings) => Promise<void>;
  run: (fn: () => Promise<unknown>, success?: string) => Promise<boolean>;
};
const Context = createContext<UI>(null!);
export function Provider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const me = useQuery({
    queryKey: ["me"],
    queryFn: async () => {
      const v = await api<Me>("/auth/me");
      csrf = v.csrf;
      return v;
    },
    retry: 1,
  });
  const currentViewer = me.data?.user?.id ?? "anonymous";
  useEffect(() => {
    qc.removeQueries({
      predicate: (query) => {
        const scope = query.queryKey.at(-1);
        return (
          !!scope &&
          typeof scope === "object" &&
          "viewer" in scope &&
          scope.viewer !== currentViewer
        );
      },
    });
  }, [currentViewer, qc]);
  const [local, setLocal] = useState<Settings>(() => {
    try {
      return {
        ...initial,
        ...JSON.parse(localStorage.getItem("m2-preferences") ?? "{}"),
      };
    } catch {
      return initial;
    }
  });
  const [toast, setToast] = useState("");
  const [authOpen, setAuth] = useState(false);
  const saved = me.data?.settings;
  const settings: Settings = saved
    ? {
        language: saved.language,
        theme: saved.theme,
        hide_seen: !!saved.hide_seen,
        notifications: !!saved.notifications,
        reduced_motion: !!saved.reduced_motion,
      }
    : local;
  useEffect(() => {
    const media = matchMedia("(prefers-color-scheme: light)");
    const apply = () => {
      document.documentElement.dataset.theme =
        settings.theme === "system"
          ? media.matches
            ? "light"
            : "dark"
          : settings.theme;
    };
    apply();
    media.addEventListener("change", apply);
    document.documentElement.lang = settings.language;
    document.documentElement.dataset.reducedMotion = settings.reduced_motion
      ? "true"
      : "false";
    return () => media.removeEventListener("change", apply);
  }, [settings.theme, settings.language, settings.reduced_motion]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 4500);
    return () => clearTimeout(timer);
  }, [toast]);
  const t = (s: string) =>
    settings.language === "en"
      ? (en[s] ?? s)
      : settings.language === "kk"
        ? (kk[s] ?? s)
        : s;
  const refresh = async () => {
    await qc.invalidateQueries();
  };
  const run = async (fn: () => Promise<unknown>, success?: string) => {
    try {
      await fn();
      await refresh();
      if (success) setToast(t(success));
      return true;
    } catch (e) {
      setToast(e instanceof Error ? e.message : "Ошибка");
      return false;
    }
  };
  const saveSettings = async (s: Settings) => {
    if (me.data?.user) await api("/settings", "PATCH", s);
    setLocal(s);
    localStorage.setItem("m2-preferences", JSON.stringify(s));
    await qc.invalidateQueries({ queryKey: ["me"] });
  };
  return (
    <Context.Provider
      value={{
        user: me.data?.user ?? null,
        loading: me.isPending,
        settings,
        t,
        notice: setToast,
        authenticate: () => setAuth(true),
        authOpen,
        setAuth,
        refresh,
        saveSettings,
        run,
      }}
    >
      {children}
      {me.isError && (
        <div className="connection-error" role="alert">
          {me.error.message}{" "}
          <button onClick={() => void me.refetch()}>{t("Повторить")}</button>
        </div>
      )}
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </Context.Provider>
  );
}
export const useUI = () => useContext(Context);
export function useAPI<T>(
  key: unknown[],
  path: string,
  enabled = true,
  refetchInterval?: number,
) {
  return useQuery<T, Error>({
    queryKey: [
      ...key,
      { viewer: useContext(Context)?.user?.id ?? "anonymous" },
    ],
    queryFn: () => api<T>(path),
    enabled,
    retry: 1,
    refetchInterval,
    refetchIntervalInBackground: false,
  });
}
export const tierName = (tier: Tier) =>
  ({
    free: "M² Free",
    premium: "M² Premium",
    premium_plus: "M² Premium+",
    elite: "M² Elite",
  })[tier];
export const limits = {
  free: 500,
  premium: 2000,
  premium_plus: 5000,
  elite: 10000,
};
export const mediaIds = (value: string) => {
  try {
    return JSON.parse(value) as string[];
  } catch {
    return [];
  }
};
export function date(value: number, language = "ru") {
  return new Intl.DateTimeFormat(
    language === "kk" ? "kk-KZ" : language === "en" ? "en-GB" : "ru-RU",
    { day: "numeric", month: "short" },
  ).format(value);
}
export function timeAgo(value: number) {
  const minutes = Math.floor((Date.now() - value) / 60000);
  return minutes < 1
    ? "сейчас"
    : minutes < 60
      ? `${minutes} мин`
      : minutes < 1440
        ? `${Math.floor(minutes / 60)} ч`
        : date(value);
}
