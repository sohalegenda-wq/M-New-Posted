import { useState, type FormEvent } from "react";
import { ArrowUpRight, ArrowLeft, Eye, EyeOff } from "lucide-react";
import { useSearchParams } from "react-router";
import { api, useUI } from "../lib";
import { Logo, Modal } from "./common";
export function AuthModal() {
  const { authOpen, setAuth, t, refresh } = useUI();
  const [mode, setMode] = useState<"login" | "register" | "recover">("login");
  const [pending, setPending] = useState(false);
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  if (!authOpen) return null;
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setPending(true);
    setError("");
    const f = new FormData(e.currentTarget);
    const body = Object.fromEntries(f);
    try {
      await api(`/auth/${mode}`, "POST", body);
      if (mode === "recover") setSent(true);
      else {
        await refresh();
        setAuth(false);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setPending(false);
    }
  };
  return (
    <Modal
      title={t(
        mode === "register"
          ? "Зарегистрироваться"
          : mode === "recover"
            ? "Восстановление пароля"
            : "Войти",
      )}
      onClose={() => setAuth(false)}
      wide
    >
      <div className="auth-layout">
        <div className="auth-art">
          <Logo small />
          <div>
            <span className="eyebrow">YOUR VOICE. YOUR SPACE.</span>
            <h2>{t("Есть что сказать. Есть кому услышать.")}</h2>
            <div className="auth-orbit">
              <span>
                M<sup>2</sup>
              </span>
            </div>
          </div>
          <small>M² NEW POSTED © {new Date().getFullYear()}</small>
        </div>
        <form className="form auth-form" onSubmit={submit}>
          <h2>
            {t(
              mode === "register"
                ? "Создайте своё пространство."
                : mode === "recover"
                  ? "Восстановление пароля"
                  : "Добро пожаловать домой.",
            )}
          </h2>
          {sent ? (
            <p role="status">
              Если аккаунт существует, ссылка отправлена на ваш email.
            </p>
          ) : (
            <>
              {mode === "register" && (
                <>
                  <label>
                    {t("Имя")}
                    <input
                      name="display_name"
                      required
                      maxLength={60}
                      autoComplete="name"
                      placeholder="Как к вам обращаться?"
                    />
                  </label>
                  <label>
                    {t("Имя пользователя")}
                    <div className="input-prefix">
                      <span>@</span>
                      <input
                        name="username"
                        aria-label={t("Имя пользователя")}
                        required
                        pattern="[a-zA-Z0-9_]{3,24}"
                        minLength={3}
                        maxLength={24}
                        autoComplete="username"
                        placeholder="your_name"
                      />
                    </div>
                  </label>
                </>
              )}
              <label>
                Email
                <input
                  name="email"
                  type="email"
                  required
                  maxLength={254}
                  autoComplete="email"
                  placeholder="you@example.com"
                />
              </label>
              {mode !== "recover" && (
                <label>
                  {t("Пароль")}
                  <div className="password-input">
                    <input
                      name="password"
                      aria-label={t("Пароль")}
                      type={show ? "text" : "password"}
                      required
                      minLength={mode === "register" ? 10 : 1}
                      maxLength={128}
                      autoComplete={
                        mode === "register"
                          ? "new-password"
                          : "current-password"
                      }
                      placeholder={
                        mode === "register"
                          ? "Минимум 10 символов"
                          : "Ваш пароль"
                      }
                    />
                    <button
                      type="button"
                      className="icon-button"
                      aria-label="Показать пароль"
                      onClick={() => setShow(!show)}
                    >
                      {show ? <EyeOff size={17} /> : <Eye size={17} />}
                    </button>
                  </div>
                </label>
              )}
              {error && (
                <p className="field-error" role="alert">
                  {error}
                </p>
              )}
              <button className="button" disabled={pending}>
                {pending
                  ? "…"
                  : t(
                      mode === "register"
                        ? "Зарегистрироваться"
                        : mode === "recover"
                          ? "Отправить ссылку"
                          : "Войти",
                    )}
                <ArrowUpRight size={17} />
              </button>
            </>
          )}
          {mode === "login" ? (
            <>
              <button
                type="button"
                className="text-button muted"
                onClick={() => {
                  setMode("recover");
                  setError("");
                }}
              >
                {t("Забыли пароль?")}
              </button>
              <div className="form-divider" />
              <button
                type="button"
                className="button secondary"
                onClick={() => {
                  setMode("register");
                  setError("");
                }}
              >
                {t("Зарегистрироваться")}
              </button>
            </>
          ) : (
            <button
              type="button"
              className="text-button muted"
              onClick={() => {
                setMode("login");
                setError("");
                setSent(false);
              }}
            >
              <ArrowLeft size={14} />
              {t("Вернуться ко входу")}
            </button>
          )}
          <p className="fine-print">
            Продолжая, вы соглашаетесь соблюдать правила сообщества M².
          </p>
        </form>
      </div>
    </Modal>
  );
}
export function ResetPage() {
  const [params] = useSearchParams();
  const { t, run, authenticate } = useUI();
  const [done, setDone] = useState(false);
  return (
    <div className="page-pad">
      <h1>{t("Новый пароль")}</h1>
      {done ? (
        <>
          <p>Пароль обновлён. Войдите снова.</p>
          <button className="button" onClick={authenticate}>
            {t("Войти")}
          </button>
        </>
      ) : (
        <form
          className="form"
          onSubmit={async (e) => {
            e.preventDefault();
            const password = new FormData(e.currentTarget).get("password");
            if (
              await run(() =>
                api("/auth/reset", "POST", {
                  token: params.get("token"),
                  password,
                }),
              )
            )
              setDone(true);
          }}
        >
          <label>
            {t("Новый пароль")}
            <input
              name="password"
              aria-label={t("Пароль")}
              type="password"
              required
              minLength={10}
              maxLength={128}
            />
          </label>
          <button className="button">{t("Сохранить")}</button>
        </form>
      )}
    </div>
  );
}
