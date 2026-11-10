import { useState } from "react";
import { Link, useLocation } from "react-router";
import { Search, ShieldCheck, Crown, ArrowUpRight, Check } from "lucide-react";
import { api, useUI, useAPI, type Profile } from "./lib";
import { PageHeader } from "./pages";
import { Empty, ErrorState, Skeleton, Modal } from "./components/common";
type AdminUser = Profile & {
  banned_until: number | null;
  ban_reason: string | null;
};
type Report = {
  id: string;
  post_id: string | null;
  reason: string;
  content: string;
  reporter: string;
  status: string;
};
export function Admin() {
  const { user, t, run } = useUI();
  const location = useLocation();
  const [tab, setTab] = useState(
    location.pathname === "/admin/premium" ? "premium" : "users",
  );
  const [search, setSearch] = useState("");
  const [submitted, setSubmitted] = useState("");
  const [target, setTarget] = useState<AdminUser | null>(null);
  const [action, setAction] = useState<"premium" | "ban" | "role" | "badge">(
    "premium",
  );
  const [report, setReport] = useState<Report | null>(null);
  const [pending, setPending] = useState(false);
  const allowed = !!user && user.role !== "user";
  const canPremium = user?.role === "owner" || user?.role === "administrator";
  const stats = useAPI<Record<string, number>>(
    ["admin-stats"],
    "/admin/stats",
    allowed,
  );
  const people = useAPI<AdminUser[]>(
    ["admin-users", submitted],
    `/admin/users?q=${encodeURIComponent(submitted)}`,
    allowed,
  );
  const reports = useAPI<Report[]>(
    ["admin-reports"],
    "/admin/reports",
    allowed && tab === "reports",
  );
  const audit = useAPI<
    {
      id: string;
      actor: string;
      action: string;
      target_id: string;
      detail: string;
      created_at: number;
    }[]
  >(["audit"], "/admin/audit", allowed && tab === "audit");
  const grants = useAPI<
    {
      id: string;
      username: string;
      tier: string;
      expires_at: number | null;
      revoked_at: number | null;
      created_at: number;
    }[]
  >(["grants"], "/admin/premium", allowed && canPremium && tab === "premium");
  const settings = useAPI<{ key: string; value: string }[]>(
    ["admin-settings"],
    "/admin/settings",
    user?.role === "owner" && tab === "system",
  );
  const appeals = useAPI<{ id: string; username: string; reason: string }[]>(
    ["appeals"],
    "/admin/appeals",
    allowed && tab === "reports",
  );
  if (!allowed)
    return (
      <>
        <PageHeader title="Администрирование" />
        <Empty
          icon={<ShieldCheck />}
          title="Нет доступа"
          text="Этот раздел доступен сотрудникам с соответствующими правами."
        />
      </>
    );
  return (
    <>
      <PageHeader title="Администрирование">
        <span className="chip">{user.role}</span>
      </PageHeader>
      <div className="admin-intro">
        <ShieldCheck size={27} />
        <div>
          <span className="eyebrow">M² CONTROL ROOM</span>
          <h2>Порядок в вашем пространстве.</h2>
        </div>
      </div>
      {stats.error ? (
        <ErrorState error={stats.error} />
      ) : (
        <div className="admin-stats">
          {[
            ["users", "Аккаунты"],
            ["new_users", "Новые за 24 ч"],
            ["active_users", "Активные сессии"],
            ["posts", "Публикации"],
            ["replies", "Ответы"],
            ["reports", "Жалобы"],
            ["banned", "Ограничены"],
            ["premium", "Premium"],
          ].map(([key, label]) => (
            <div key={key}>
              <b>{stats.data?.[key] ?? "—"}</b>
              <span>{t(label)}</span>
            </div>
          ))}
        </div>
      )}
      <nav className="tabs admin-tabs">
        {[
          ["users", "Аккаунты"],
          ...(canPremium ? [["premium", "Premium"]] : []),
          ["reports", "Жалобы"],
          ["audit", "Аудит"],
          ...(user.role === "owner" ? [["system", "Система"]] : []),
        ].map(([key, label]) => (
          <button
            key={key}
            className={tab === key ? "active" : ""}
            onClick={() => setTab(key)}
          >
            {t(label)}
          </button>
        ))}
      </nav>
      <div className="admin-content">
        {["users", "premium"].includes(tab) && (
          <>
            <form
              className="search-input"
              onSubmit={(e) => {
                e.preventDefault();
                setSubmitted(search);
              }}
            >
              <Search size={18} />
              <input
                aria-label="Поиск пользователя"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Username или ID"
              />
              <button className="text-button">{t("Найти")}</button>
            </form>
            {people.error && <ErrorState error={people.error} />}{" "}
            {people.isPending ? (
              <Skeleton />
            ) : (
              people.data?.map((p) => (
                <div className="admin-user" key={p.id}>
                  <div>
                    <Link to={`/@${p.username}`}>
                      <b>{p.display_name}</b>
                      <ArrowUpRight size={13} />
                    </Link>
                    <span>
                      @{p.username} · {p.role} · {p.tier}
                    </span>
                    <small>{p.id}</small>
                    {!!p.banned_until && p.banned_until > Date.now() && (
                      <span>Ограничен: {p.ban_reason}</span>
                    )}
                  </div>
                  <div className="admin-actions">
                    {canPremium && (
                      <button
                        className="button small secondary"
                        onClick={() => {
                          setTarget(p);
                          setAction("premium");
                        }}
                      >
                        <Crown size={13} />
                        Premium
                      </button>
                    )}
                    {tab === "users" && (
                      <>
                        <button
                          className="text-button"
                          onClick={() => {
                            setTarget(p);
                            setAction("ban");
                          }}
                        >
                          {t(
                            p.banned_until && p.banned_until > Date.now()
                              ? "Снять блокировку"
                              : "Ограничить",
                          )}
                        </button>
                        {user.role === "owner" && (
                          <>
                            <button
                              className="text-button"
                              onClick={() => {
                                setTarget(p);
                                setAction("role");
                              }}
                            >
                              Роль
                            </button>
                            <button
                              className="text-button"
                              onClick={() => {
                                setTarget(p);
                                setAction("badge");
                              }}
                            >
                              Значок
                            </button>
                          </>
                        )}
                      </>
                    )}
                  </div>
                </div>
              ))
            )}
          </>
        )}
        {tab === "premium" && (
          <>
            <h3>{t("История")}</h3>
            {grants.error && <ErrorState error={grants.error} />}{" "}
            {grants.data?.map((g) => (
              <div className="audit-row" key={g.id}>
                <b>
                  @{g.username} · {g.tier}
                </b>
                <span>
                  {g.revoked_at
                    ? "Отозван"
                    : g.expires_at
                      ? `До ${new Date(g.expires_at).toLocaleDateString()}`
                      : "Бессрочно"}
                </span>
                <small>{new Date(g.created_at).toLocaleString()}</small>
              </div>
            ))}
            {!grants.data?.length && <p className="muted">Выдач ещё нет.</p>}
          </>
        )}
        {tab === "reports" && (
          <>
            {reports.error && <ErrorState error={reports.error} />}{" "}
            {reports.data?.map((r) => (
              <article className="report-card" key={r.id}>
                <span className="chip">{r.status}</span>
                <b>@{r.reporter}</b>
                <p>{r.reason}</p>
                {r.content && <blockquote>{r.content}</blockquote>}
                {r.status === "open" && (
                  <button
                    className="button small secondary"
                    onClick={() => setReport(r)}
                  >
                    Рассмотреть
                  </button>
                )}
              </article>
            ))}
            {!reports.data?.length && <p className="muted">Жалоб пока нет.</p>}
            <h3>Обжалования</h3>
            {appeals.data?.map((a) => (
              <article className="report-card" key={a.id}>
                <b>@{a.username}</b>
                <p>{a.reason}</p>
              </article>
            ))}
          </>
        )}
        {tab === "audit" && (
          <>
            {audit.error && <ErrorState error={audit.error} />}{" "}
            {audit.data?.map((a) => (
              <article className="audit-row" key={a.id}>
                <b>
                  {a.action} · @{a.actor}
                </b>
                <span>{a.target_id}</span>
                <p>{a.detail}</p>
                <small>{new Date(a.created_at).toLocaleString()}</small>
              </article>
            ))}
            {!audit.data?.length && <p className="muted">Действий пока нет.</p>}
          </>
        )}
        {tab === "system" && (
          <>
            {settings.error && <ErrorState error={settings.error} />}{" "}
            {settings.data?.map((s) => (
              <form
                key={s.key}
                className="form system-setting"
                onSubmit={async (e) => {
                  e.preventDefault();
                  const value = new FormData(e.currentTarget).get("value");
                  if (confirm(`Изменить ${s.key}?`))
                    await run(
                      () =>
                        api("/admin/settings", "PATCH", { key: s.key, value }),
                      "Сохранено",
                    );
                }}
              >
                <label>
                  {s.key}
                  <textarea
                    defaultValue={s.value}
                    name="value"
                    rows={s.key === "rules" ? 4 : 1}
                    maxLength={5000}
                  />
                </label>
                <button className="button small secondary">
                  {t("Сохранить")}
                </button>
              </form>
            ))}
            <p className="fine-print">
              registration / maintenance: true или false. Использование
              хранилища: {Math.round((stats.data?.storage ?? 0) / 1024)} КБ. Ни
              один платный ресурс не подключён.
            </p>
          </>
        )}
      </div>
      {target && (
        <Modal
          title={`${action === "premium" ? "M² Premium" : action === "ban" ? "Модерация" : action === "badge" ? "Служебный значок" : "Роль"} · @${target.username}`}
          onClose={() => setTarget(null)}
        >
          <form
            className="form modal-form"
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              let body: Record<string, unknown>;
              if (action === "premium")
                body = {
                  tier: f.get("tier"),
                  days: f.get("forever") ? null : Number(f.get("days")),
                };
              else if (action === "ban")
                body = { days: Number(f.get("days")), reason: f.get("reason") };
              else if (action === "badge")
                body = {
                  badge: f.get("badge"),
                  enabled: f.get("enabled") === "true",
                };
              else body = { role: f.get("role") };
              if (!confirm(`Подтвердить изменение для @${target.username}?`))
                return;
              setPending(true);
              const path =
                action === "premium"
                  ? `/admin/premium/${target.id}`
                  : `/admin/users/${target.id}/${action}`;
              const ok = await run(() => api(path, "POST", body), "Сохранено");
              setPending(false);
              if (ok) setTarget(null);
            }}
          >
            {action === "premium" ? (
              <>
                <label>
                  Уровень
                  <select name="tier" defaultValue="premium">
                    <option value="premium">M² Premium</option>
                    <option value="premium_plus">M² Premium+</option>
                    <option value="elite">M² Elite</option>
                    <option value="free">Отозвать все выдачи</option>
                  </select>
                </label>
                <label>
                  {t("Дней")}
                  <input
                    name="days"
                    type="number"
                    min={1}
                    max={36500}
                    defaultValue={30}
                    required
                  />
                </label>
                <label className="checkbox">
                  <input name="forever" type="checkbox" />
                  {t("Бессрочно")}
                </label>
              </>
            ) : action === "ban" ? (
              <>
                <label>
                  {t("Дней")}
                  <select
                    name="days"
                    defaultValue={
                      target.banned_until && target.banned_until > Date.now()
                        ? 0
                        : 1
                    }
                  >
                    <option value={0}>Снять ограничение</option>
                    <option value={1}>1 день</option>
                    <option value={7}>7 дней</option>
                    <option value={30}>30 дней</option>
                    <option value={36500}>Постоянно (100 лет)</option>
                  </select>
                </label>
                <label>
                  {t("Причина")}
                  <textarea
                    name="reason"
                    required
                    minLength={5}
                    maxLength={500}
                  />
                </label>
              </>
            ) : action === "role" ? (
              <label>
                Роль
                <select name="role" defaultValue={target.role}>
                  <option value="user">User</option>
                  <option value="moderator">Moderator</option>
                  <option value="administrator">Administrator</option>
                  <option value="owner">Owner</option>
                </select>
              </label>
            ) : (
              <>
                <label>
                  Значок
                  <select name="badge">
                    {[
                      "developer",
                      "moderator",
                      "founder",
                      "official",
                      "verified",
                    ].map((b) => (
                      <option key={b}>{b}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Действие
                  <select name="enabled">
                    <option value="true">Выдать</option>
                    <option value="false">Отозвать</option>
                  </select>
                </label>
              </>
            )}
            <button className="button" disabled={pending}>
              <Check size={16} />
              {pending ? "…" : t("Сохранить")}
            </button>
          </form>
        </Modal>
      )}
      {report && (
        <Modal title="Решение по жалобе" onClose={() => setReport(null)}>
          <form
            className="form modal-form"
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              if (!confirm("Применить решение модерации?")) return;
              if (
                await run(
                  () =>
                    api(
                      `/admin/reports/${report.id}`,
                      "POST",
                      Object.fromEntries(f),
                    ),
                  "Сохранено",
                )
              )
                setReport(null);
            }}
          >
            <label>
              Решение
              <select name="status">
                <option value="resolved">Рассмотрена</option>
                <option value="dismissed">Отклонена</option>
              </select>
            </label>
            <label>
              Действие
              <select name="action">
                <option value="none">Сохранить публикацию</option>
                <option value="hide">Скрыть публикацию</option>
                <option value="delete">Удалить публикацию</option>
              </select>
            </label>
            <label>
              {t("Причина")}
              <textarea name="reason" required minLength={5} maxLength={500} />
            </label>
            <button className="button">{t("Сохранить")}</button>
          </form>
        </Modal>
      )}
    </>
  );
}
