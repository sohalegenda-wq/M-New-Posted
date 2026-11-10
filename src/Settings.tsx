import { useState, useEffect } from "react";
import { Link } from "react-router";
import {
  Moon,
  Sun,
  Monitor,
  ArrowUpRight,
  Download,
  LogOut,
  Shield,
  Trash2,
  Laptop,
  Check,
  Send,
} from "lucide-react";
import { api, useUI, useAPI, type Settings, tierName } from "./lib";
import { PageHeader } from "./pages";
import { Avatar, Modal, Toggle, ErrorState } from "./components/common";
export function SettingsPage() {
  const { user, t, settings, saveSettings, run, notice } = useUI();
  const [value, setValue] = useState<Settings>(settings);
  const [pending, setPending] = useState(false);
  useEffect(
    () => setValue(settings),
    [
      settings.language,
      settings.theme,
      settings.hide_seen,
      settings.notifications,
      settings.reduced_motion,
    ],
  );
  const [dialog, setDialog] = useState<"password" | "delete" | "appeal" | null>(
    null,
  );
  const sessions = useAPI<
    { id: string; label: string; created_at: number; current: boolean }[]
  >(["sessions"], "/auth/sessions");
  const safety = useAPI<{
    blocks: { id: string; username: string }[];
    mutes: { id: string; username: string }[];
  }>(["safety"], "/safety");
  const save = async () => {
    setPending(true);
    await run(() => saveSettings(value), "Настройки сохранены");
    setPending(false);
  };
  const logout = () => void run(() => api("/auth/logout", "POST"));
  return (
    <>
      <PageHeader title="Настройки" />
      <div className="settings-body">
        {user && (
          <Link to={`/@${user.username}`} className="settings-user">
            <Avatar name={user.display_name} id={user.avatar_id} />
            <div>
              <b>{user.display_name}</b>
              <span>@{user.username}</span>
            </div>
            <ArrowUpRight size={18} />
          </Link>
        )}
        <section>
          <span className="eyebrow">01 / PERSONAL SPACE</span>
          <h2>{t("Внешний вид")}</h2>
          <div className="theme-choices">
            {(
              [
                ["dark", "Тёмная", Moon],
                ["light", "Светлая", Sun],
                ["system", "Системная", Monitor],
              ] as const
            ).map(([key, label, Icon]) => (
              <button
                key={key}
                className={value.theme === key ? "selected" : ""}
                onClick={() => setValue({ ...value, theme: key })}
              >
                <Icon size={21} />
                {t(label)}
                {value.theme === key && <Check size={12} />}
              </button>
            ))}
          </div>
          <label className="setting-label">
            {t("Язык")}
            <select
              value={value.language}
              onChange={(e) =>
                setValue({
                  ...value,
                  language: e.target.value as Settings["language"],
                })
              }
            >
              <option value="ru">Русский</option>
              <option value="en">English</option>
              <option value="kk">Қазақша</option>
            </select>
          </label>
          <Toggle
            label={t("Уменьшить анимацию")}
            value={!!value.reduced_motion}
            onChange={(v) => setValue({ ...value, reduced_motion: v })}
          />
          <Toggle
            label={t("Скрывать просмотренное")}
            value={!!value.hide_seen}
            onChange={(v) => setValue({ ...value, hide_seen: v })}
          />
          <Toggle
            label={t("Получать уведомления")}
            value={!!value.notifications}
            onChange={(v) => setValue({ ...value, notifications: v })}
          />
          <button
            className="button"
            disabled={pending}
            onClick={() => void save()}
          >
            {pending ? "…" : t("Сохранить")}
          </button>
        </section>
        {user && (
          <>
            <section>
              <span className="eyebrow">02 / YOUR ACCOUNT</span>
              <h2>{t("Безопасность")}</h2>
              <button
                className="setting-link"
                onClick={() => setDialog("password")}
              >
                <Shield size={18} />
                {t("Сменить пароль")}
                <ArrowUpRight size={16} />
              </button>
              <Link className="setting-link" to="/premium">
                <span className="m2-tiny">M²</span>
                {tierName(user.tier)}
                <ArrowUpRight size={16} />
              </Link>
              <button
                className="setting-link"
                onClick={() =>
                  void run(async () => {
                    const data = await api("/export");
                    const url = URL.createObjectURL(
                      new Blob([JSON.stringify(data, null, 2)], {
                        type: "application/json",
                      }),
                    );
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = "m2-data.json";
                    a.click();
                    URL.revokeObjectURL(url);
                  })
                }
              >
                <Download size={18} />
                {t("Экспорт данных")}
                <ArrowUpRight size={16} />
              </button>
              <button
                className="setting-link"
                onClick={() => setDialog("appeal")}
              >
                <Send size={17} />
                {t("Обжаловать ограничение")}
                <ArrowUpRight size={16} />
              </button>
            </section>
            <section>
              <span className="eyebrow">03 / DEVICES</span>
              <h2>{t("Сессии")}</h2>
              {sessions.error && <ErrorState error={sessions.error} />}{" "}
              {sessions.data?.map((s) => (
                <div className="session" key={s.id}>
                  <Laptop size={20} />
                  <div>
                    <b>
                      {s.label.includes("Mobile")
                        ? "Mobile browser"
                        : "Desktop browser"}
                    </b>
                    <small>{new Date(s.created_at).toLocaleString()}</small>
                  </div>
                  {s.current ? (
                    <span className="chip">{t("Текущая")}</span>
                  ) : (
                    <button
                      className="text-button"
                      onClick={() =>
                        void run(() => api(`/auth/sessions/${s.id}`, "DELETE"))
                      }
                    >
                      {t("Завершить")}
                    </button>
                  )}
                </div>
              ))}
            </section>
            <section>
              <h2>{t("Заблокированные аккаунты")}</h2>
              {safety.data?.blocks.length ? (
                safety.data.blocks.map((p) => (
                  <div className="safety-row" key={p.id}>
                    <span>@{p.username}</span>
                    <button
                      className="text-button"
                      onClick={() =>
                        void run(() => api(`/users/${p.id}/block`, "DELETE"))
                      }
                    >
                      {t("Разблокировать")}
                    </button>
                  </div>
                ))
              ) : (
                <p className="muted">Список пуст</p>
              )}
              <h2>{t("Скрытые аккаунты")}</h2>
              {safety.data?.mutes.length ? (
                safety.data.mutes.map((p) => (
                  <div className="safety-row" key={p.id}>
                    <span>@{p.username}</span>
                    <button
                      className="text-button"
                      onClick={() =>
                        void run(() => api(`/users/${p.id}/mute`, "DELETE"))
                      }
                    >
                      {t("Перестать скрывать")}
                    </button>
                  </div>
                ))
              ) : (
                <p className="muted">Список пуст</p>
              )}
            </section>
            <section className="account-actions">
              <button className="button secondary" onClick={logout}>
                <LogOut size={16} />
                {t("Выйти")}
              </button>
              <button
                className="text-button muted"
                onClick={() => setDialog("delete")}
              >
                <Trash2 size={15} />
                {t("Удалить аккаунт")}
              </button>
            </section>
          </>
        )}
        {!user && (
          <button
            className="text-button"
            onClick={() => notice("Настройки сохранены на этом устройстве.")}
          >
            Настройки на этом устройстве
          </button>
        )}
      </div>
      {dialog && (
        <Modal
          title={t(
            dialog === "password"
              ? "Сменить пароль"
              : dialog === "delete"
                ? "Удалить аккаунт"
                : "Обжаловать ограничение",
          )}
          onClose={() => setDialog(null)}
        >
          <form
            className="form modal-form"
            onSubmit={async (e) => {
              e.preventDefault();
              setPending(true);
              const f = new FormData(e.currentTarget);
              const path =
                dialog === "password"
                  ? "/auth/password"
                  : dialog === "delete"
                    ? "/auth/account"
                    : "/appeals";
              if (
                dialog === "delete" &&
                !confirm(
                  "Удалить аккаунт и все данные без возможности восстановления?",
                )
              ) {
                setPending(false);
                return;
              }
              const ok = await run(
                () =>
                  api(
                    path,
                    dialog === "delete" ? "DELETE" : "POST",
                    Object.fromEntries(f),
                  ),
                dialog === "appeal" ? "Обжалование отправлено" : "Сохранено",
              );
              setPending(false);
              if (ok) setDialog(null);
            }}
          >
            {dialog === "appeal" ? (
              <label>
                {t("Причина")}
                <textarea
                  name="reason"
                  minLength={10}
                  maxLength={2000}
                  required
                  rows={5}
                />
              </label>
            ) : (
              <>
                {dialog === "password" && (
                  <label>
                    {t("Текущий пароль")}
                    <input
                      type="password"
                      name="current"
                      autoComplete="current-password"
                      required
                      maxLength={128}
                    />
                  </label>
                )}
                <label>
                  {t(dialog === "password" ? "Новый пароль" : "Пароль")}
                  <input
                    type="password"
                    name="password"
                    autoComplete={
                      dialog === "password"
                        ? "new-password"
                        : "current-password"
                    }
                    required
                    minLength={dialog === "password" ? 10 : 1}
                    maxLength={128}
                  />
                </label>
              </>
            )}
            {dialog === "delete" && (
              <p className="fine-print">{t("Это действие нельзя отменить.")}</p>
            )}
            <button className="button" disabled={pending}>
              {pending ? "…" : t(dialog === "delete" ? "Удалить" : "Сохранить")}
            </button>
          </form>
        </Modal>
      )}
    </>
  );
}
