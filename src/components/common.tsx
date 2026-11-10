import { useEffect, useRef, type ReactNode } from "react";
import { Link } from "react-router";
import { ArrowUpRight, X, Sparkles, Check, Lock, RotateCw } from "lucide-react";
import { useUI, useAPI, tierName, type Tier } from "../lib";
export function Logo({ small = false }: { small?: boolean }) {
  const platform = useAPI<{ settings: { key: string; value: string }[] }>(
    ["platform"],
    "/platform",
  );
  const name =
    platform.data?.settings.find((s) => s.key === "name")?.value ??
    "M² New Posted";
  return (
    <Link
      to="/"
      aria-label={name}
      className={`logo ${small ? "logo-small" : ""}`}
    >
      M<sup>2</sup>
      {!small && (
        <span>
          {name === "M² New Posted" ? "NEW POSTED" : name.replace(/^M² /, "")}
          <span className="logo-dot">.</span>
        </span>
      )}
    </Link>
  );
}
export function Avatar({
  name,
  id,
  size = "normal",
}: {
  name: string;
  id?: string | null;
  size?: "normal" | "large" | "small";
}) {
  return (
    <span className={`avatar avatar-${size}`}>
      {id ? (
        <img src={`/media/${id}`} alt="" loading="lazy" />
      ) : (
        <span>{name.slice(0, 1).toUpperCase()}</span>
      )}
    </span>
  );
}
export function Badge({ tier }: { tier: Tier }) {
  return tier !== "free" ? (
    <span className={`badge badge-${tier}`} title={tierName(tier)}>
      <Sparkles size={11} />
      {tier === "elite" ? "ELITE" : tier === "premium_plus" ? "M²+" : "M²"}
    </span>
  ) : null;
}
export function Modal({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const { t } = useUI();
  useEffect(() => {
    const active = document.activeElement as HTMLElement;
    const old = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusables = () =>
      Array.from(
        ref.current?.querySelectorAll<HTMLElement>(
          'button,input,textarea,select,a[href],[tabindex="0"]',
        ) ?? [],
      ).filter((e) => !e.hasAttribute("disabled"));
    focusables()[0]?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeRef.current();
      if (e.key === "Tab") {
        const nodes = focusables();
        const first = nodes[0],
          last = nodes.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      document.body.style.overflow = old;
      document.removeEventListener("keydown", key);
      active?.focus();
    };
  }, []);
  return (
    <div className="modal-shade" onClick={onClose}>
      <div
        className={`modal ${wide ? "modal-wide" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        ref={ref}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal-header">
          <h2>{title}</h2>
          <button
            className="icon-button"
            aria-label={t("Закрыть")}
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </header>
        {children}
      </div>
    </div>
  );
}
export function Empty({
  title = "Здесь пока тихо",
  text = "Начните разговор. Возможно, именно вашей мысли здесь не хватает.",
  action,
  icon,
}: {
  title?: string;
  text?: string;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  const { t } = useUI();
  return (
    <div className="empty">
      <span className="empty-mark">
        {icon ?? (
          <span>
            M<sup>2</sup>
          </span>
        )}
      </span>
      <h2>{t(title)}</h2>
      <p>{t(text)}</p>
      {action}
    </div>
  );
}
export function ErrorState({
  error,
  retry,
}: {
  error: Error;
  retry?: () => void;
}) {
  const { t } = useUI();
  return (
    <div className="error-state">
      <p>{error.message}</p>
      {retry && (
        <button className="button secondary" onClick={retry}>
          <RotateCw size={15} />
          {t("Повторить")}
        </button>
      )}
    </div>
  );
}
export function Skeleton() {
  return (
    <div aria-label="Загрузка" className="skeleton-post">
      <div className="skeleton circle" />
      <div className="skeleton-lines">
        <div className="skeleton w-32" />
        <div className="skeleton" />
        <div className="skeleton w-4/5" />
      </div>
    </div>
  );
}
export function Gate({ children }: { children: ReactNode }) {
  const { user, loading, authenticate, t } = useUI();
  if (loading) return <Skeleton />;
  return user ? (
    <>{children}</>
  ) : (
    <Empty
      icon={<Lock />}
      title="Ваш голос. Ваше пространство."
      text="Место для мыслей, которые хочется разделить."
      action={
        <button className="button" onClick={authenticate}>
          {t("Войти")}
          <ArrowUpRight size={16} />
        </button>
      }
    />
  );
}
export function Toggle({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="toggle-row">
      <span>{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={!!value}
        aria-label={label}
        className={`toggle ${value ? "on" : ""}`}
        onClick={() => onChange(!value)}
      >
        <span>{value && <Check size={10} />}</span>
      </button>
    </label>
  );
}
