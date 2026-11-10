import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import {
  Search as SearchIcon,
  ArrowUpRight,
  ArrowLeft,
  Plus,
  CheckCheck,
  UserPlus,
  Heart,
  Repeat2,
  MessageCircle,
  AtSign,
  Sparkles,
  Calendar,
  Link2,
  MoreHorizontal,
  FileText,
  BarChart3,
  Crown,
  Check,
  Lock,
  Send,
  Trash2,
  ImagePlus,
  Flag,
} from "lucide-react";
import {
  api,
  useAPI,
  useUI,
  type Profile,
  type Post,
  type Tier,
  tierName,
  date,
} from "./lib";
import {
  Avatar,
  Badge,
  Empty,
  ErrorState,
  Gate,
  Skeleton,
} from "./components/common";
import { Composer, ComposeModal, EditProfile } from "./components/Composer";
import { Feed } from "./components/Feed";
import { PostCard } from "./components/Post";
export function PageHeader({
  title,
  children,
  back = false,
}: {
  title: string;
  children?: React.ReactNode;
  back?: boolean;
}) {
  const { t } = useUI();
  const navigate = useNavigate();
  return (
    <header className="page-header">
      <div>
        {back && (
          <button
            className="icon-button"
            aria-label={t("Назад")}
            onClick={() => navigate(-1)}
          >
            <ArrowLeft size={19} />
          </button>
        )}
        <h1>{t(title)}</h1>
      </div>
      {children}
    </header>
  );
}
export function Home() {
  const { user, authenticate, t } = useUI();
  const [mode, setMode] = useState("for-you");
  return (
    <>
      <PageHeader title="Лента">
        <span className="live-label">
          <i />
          YOUR DAILY SPACE
        </span>
      </PageHeader>
      {!user && (
        <section className="welcome-strip">
          <span className="eyebrow">
            A LITTLE LESS NOISE. A LITTLE MORE YOU.
          </span>
          <h2>
            {t("Ваш голос.")}
            <br />
            <span>{t("Ваше пространство.")}</span>
          </h2>
          <p>{t("Место для мыслей, которые хочется разделить.")}</p>
          <button className="text-button" onClick={authenticate}>
            {t("Присоединиться")}
            <ArrowUpRight size={16} />
          </button>
          <span className="welcome-symbol">
            m<sup>2</sup>
          </span>
        </section>
      )}
      <nav className="tabs feed-tabs" aria-label="Режим ленты">
        {[
          ["for-you", "Для вас"],
          ["following", "Подписки"],
          ["latest", "Новое"],
        ].map(([key, label]) => (
          <button
            className={mode === key ? "active" : ""}
            key={key}
            onClick={() => {
              if (key === "following" && !user) {
                authenticate();
                return;
              }
              setMode(key);
            }}
          >
            {t(label)}
            {key === "for-you" && <Sparkles size={12} />}
          </button>
        ))}
      </nav>
      <Composer />
      <Feed path={`/feed?mode=${mode}`} />
    </>
  );
}
export function SearchPage() {
  const { t, user } = useUI();
  const [params, setParams] = useSearchParams();
  const query = params.get("q") ?? "";
  const [input, setInput] = useState(query);
  const [tab, setTab] = useState("all");
  const people = useAPI<Profile[]>(
    ["people", query],
    `/people?q=${encodeURIComponent(query)}`,
  );
  const recent = useAPI<{ query: string }[]>(["recent"], "/searches", !!user);
  useEffect(() => setInput(query), [query]);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    setParams(input.trim() ? { q: input.trim() } : {});
    if (user && input.trim())
      void api("/searches", "POST", { query: input.trim() });
  };
  return (
    <>
      <PageHeader title="Поиск" />
      <section className="search-section">
        <span className="eyebrow">DISCOVER YOUR NEXT CONVERSATION</span>
        <h2>{t("Найти людей и мысли")}</h2>
        <form onSubmit={submit} className="search-input">
          <SearchIcon size={19} />
          <input
            aria-label={t("Поиск")}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={t("Поиск по имени, публикациям и #темам")}
          />
          <button className="icon-button" aria-label={t("Найти")}>
            <ArrowUpRight size={20} />
          </button>
        </form>
        {!query && !!recent.data?.length && (
          <div className="search-recent">
            {recent.data.map((v) => (
              <button
                key={v.query}
                className="chip"
                onClick={() => setParams({ q: v.query })}
              >
                {v.query}
              </button>
            ))}
          </div>
        )}
      </section>
      <nav className="tabs">
        {[
          ["all", "Все"],
          ["people", "Люди"],
          ["posts", "Публикации"],
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
      {tab !== "posts" && (
        <div className="people-results">
          {people.isPending ? (
            <Skeleton />
          ) : people.error ? (
            <ErrorState error={people.error} />
          ) : people.data?.length ? (
            people.data.map((p) => <Person key={p.id} person={p} />)
          ) : tab === "people" || !query ? (
            <Empty
              title="Найдите своих"
              text="Пользователи появятся здесь после регистрации."
            />
          ) : null}
        </div>
      )}
      {tab !== "people" && query && (
        <Feed
          path={`/feed?mode=latest&q=${encodeURIComponent(query)}`}
          emptyTitle="Ничего не найдено"
          emptyText="Попробуйте другой запрос."
        />
      )}
    </>
  );
}
export function Person({
  person,
}: {
  person: Pick<
    Profile,
    "id" | "username" | "display_name" | "avatar_id" | "bio" | "is_following"
  >;
}) {
  const { user, t, authenticate, run } = useUI();
  return (
    <div className="person">
      <Link className="person-info" to={`/@${person.username}`}>
        <Avatar name={person.display_name} id={person.avatar_id} />
        <div>
          <b>{person.display_name}</b>
          <span>@{person.username}</span>
          {person.bio && <p>{person.bio.slice(0, 80)}</p>}
        </div>
      </Link>
      <button
        className={`button small ${person.is_following ? "secondary" : ""}`}
        onClick={() => {
          if (!user) authenticate();
          else
            void run(() =>
              api(
                `/users/${person.id}/follow`,
                person.is_following ? "DELETE" : "PUT",
              ),
            );
        }}
      >
        {person.is_following ? <Check size={14} /> : <Plus size={14} />}
        <span>{t(person.is_following ? "Вы подписаны" : "Подписаться")}</span>
      </button>
    </div>
  );
}
export function ProfilePage() {
  const { username: raw } = useParams();
  const username = (raw ?? "").replace(/^@/, "");
  const { user, t, run, authenticate, notice } = useUI();
  const profile = useAPI<Profile>(
    ["profile", username],
    `/users/${encodeURIComponent(username)}`,
  );
  const [tab, setTab] = useState("posts");
  const [editing, setEditing] = useState(false);
  const navigate = useNavigate();
  const p = profile.data;
  if (profile.isPending)
    return (
      <>
        <PageHeader title="Профиль" />
        <Skeleton />
        <Skeleton />
      </>
    );
  if (profile.error)
    return (
      <>
        <PageHeader title="Профиль" back />
        <Empty
          title="Страница не найдена"
          text={profile.error.message}
          action={
            <Link to="/" className="button">
              {t("Вернуться в ленту")}
            </Link>
          }
        />
      </>
    );
  if (!p) return null;
  const own = p.id === user?.id;
  return (
    <>
      <PageHeader title={p.display_name} back>
        <Link
          className="icon-button"
          aria-label="Ссылка на профиль"
          to={`/@${p.username}`}
          onClick={(e) => {
            e.preventDefault();
            void navigator.clipboard
              .writeText(location.href)
              .then(() => notice(t("Ссылка скопирована")));
          }}
        >
          <Link2 size={18} />
        </Link>
      </PageHeader>
      <section className={`profile-section profile-style-${p.style}`}>
        <div
          className={`profile-banner ${p.banner_id && p.tier !== "free" ? "has-image" : ""}`}
        >
          {p.banner_id && p.tier !== "free" ? (
            <img src={`/media/${p.banner_id}`} alt="Баннер профиля" />
          ) : (
            <>
              <span>YOUR VOICE.</span>
              <span>YOUR SPACE.</span>
              <b>
                M<sup>2</sup>
              </b>
            </>
          )}
        </div>
        <div className="profile-body">
          <div className="profile-top">
            <Avatar name={p.display_name} id={p.avatar_id} size="large" />
            <div className="profile-buttons">
              {own ? (
                <button
                  className="button secondary small"
                  onClick={() => setEditing(true)}
                >
                  {t("Редактировать профиль")}
                </button>
              ) : (
                <>
                  <button
                    className="button secondary small"
                    onClick={() => {
                      if (!user) {
                        authenticate();
                        return;
                      }
                      void run(async () => {
                        const r = await api<{ id: string }>(
                          "/conversations",
                          "POST",
                          { user_id: p.id },
                        );
                        navigate(`/messages?conversation=${r.id}`);
                      });
                    }}
                  >
                    <MessageCircle size={16} />
                    {t("Написать")}
                  </button>
                  <button
                    className={`button small ${p.is_following ? "secondary" : ""}`}
                    onClick={() => {
                      if (!user) authenticate();
                      else
                        void run(() =>
                          api(
                            `/users/${p.id}/follow`,
                            p.is_following ? "DELETE" : "PUT",
                          ),
                        );
                    }}
                  >
                    {t(p.is_following ? "Вы подписаны" : "Подписаться")}
                  </button>
                  <details className="post-menu">
                    <summary
                      className="icon-button"
                      aria-label="Действия с аккаунтом"
                    >
                      <MoreHorizontal size={20} />
                    </summary>
                    <div className="menu">
                      <button
                        onClick={() => {
                          if (!user) {
                            authenticate();
                            return;
                          }
                          if (confirm(`${t("Заблокировать")} @${p.username}?`))
                            void run(async () => {
                              await api(`/users/${p.id}/block`, "PUT");
                              navigate("/");
                            });
                        }}
                      >
                        {t("Заблокировать")}
                      </button>
                    </div>
                  </details>
                </>
              )}
            </div>
          </div>
          <h2>
            {p.display_name}
            <Badge tier={p.tier} />
            {JSON.parse(p.badges ?? "[]").map((b: string) => (
              <span className="service-badge" key={b}>
                {b}
              </span>
            ))}
          </h2>
          <div className="profile-username">
            @{p.username}
            {!!p.private && <Lock size={13} />}
          </div>
          {p.status && p.tier !== "free" && (
            <div className="profile-status">{p.status}</div>
          )}
          <p className="profile-bio">{p.bio || " "}</p>
          <div className="profile-meta">
            {p.website && (
              <a href={p.website} target="_blank" rel="noreferrer">
                <Link2 size={14} />
                {p.website.replace(/^https?:\/\//, "")}
              </a>
            )}
            <span>
              <Calendar size={14} />
              {t("Участник с")} {date(p.created_at)}
            </span>
          </div>
          <div className="profile-stats">
            <span>
              <b>{p.followers}</b> {t("подписчиков")}
            </span>
            <span>
              <b>{p.following}</b> {t("подписок")}
            </span>
            <span>
              <b>{p.post_count}</b> {t("публикаций")}
            </span>
          </div>
        </div>
      </section>
      <nav className="tabs">
        {[
          ["posts", "Публикации"],
          ["replies", "Ответы"],
          ["media", "Медиа"],
          ["reposts", "Репосты"],
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
      <Feed path={`/feed?mode=latest&author=${p.id}&tab=${tab}`} />
      {editing && <EditProfile profile={p} onClose={() => setEditing(false)} />}
    </>
  );
}
export function PostPage() {
  const { id } = useParams();
  const post = useAPI<Post>(["post", id], `/posts/${id}`);
  const { user } = useUI();
  return (
    <>
      <PageHeader title="Публикация" back />
      {post.isPending ? (
        <Skeleton />
      ) : post.error ? (
        <ErrorState error={post.error} />
      ) : post.data ? (
        <>
          <PostCard post={post.data} detail />
          {user && <Composer parent={post.data} />}
          <div className="section-label">Ответы</div>
          <Feed
            path={`/feed?parent=${id}&mode=latest`}
            emptyTitle="Начните разговор"
            emptyText="Ваш ответ может стать началом чего-то интересного."
          />
        </>
      ) : null}
    </>
  );
}
type Notification = {
  id: string;
  type: string;
  post_id: string | null;
  username: string;
  display_name: string;
  avatar_id: string | null;
  created_at: number;
  read_at: number | null;
  text: string;
};
export function Notifications() {
  const { t, run } = useUI();
  const n = useAPI<Notification[]>(
    ["notifications"],
    "/notifications",
    true,
    30000,
  );
  const labels: Record<string, string> = {
    like: "нравится ваша публикация",
    reply: "ответил(а) на публикацию",
    follow: "теперь читает вас",
    repost: "поделился(ась) публикацией",
    mention: "упомянул(а) вас",
    premium: "подарок M²",
    moderation: "действие модерации",
  };
  const icons: Record<string, React.ReactNode> = {
    like: <Heart size={16} />,
    reply: <MessageCircle size={16} />,
    follow: <UserPlus size={16} />,
    repost: <Repeat2 size={16} />,
    mention: <AtSign size={16} />,
    premium: <Sparkles size={16} />,
  };
  const groups = Object.values(
    (n.data ?? []).reduce<
      Record<string, { item: Notification; count: number }>
    >((all, v) => {
      const key = `${v.type}:${v.post_id ?? v.id}:${date(v.created_at)}`;
      if (!all[key]) all[key] = { item: v, count: 0 };
      all[key].count++;
      return all;
    }, {}),
  );
  return (
    <>
      <PageHeader title="Уведомления">
        <button
          className="icon-button"
          aria-label={t("Отметить прочитанными")}
          title={t("Отметить прочитанными")}
          onClick={() => void run(() => api("/notifications/read", "POST"))}
        >
          <CheckCheck size={20} />
        </button>
      </PageHeader>
      {n.isPending ? (
        <Skeleton />
      ) : n.error ? (
        <ErrorState error={n.error} />
      ) : !groups.length ? (
        <Empty
          icon={<Heart />}
          title="Новых уведомлений пока нет"
          text="Здесь появятся ответы, подписки и реакции на ваши публикации."
        />
      ) : (
        groups.map(({ item: v, count }) => (
          <Link
            to={
              v.post_id
                ? `/post/${v.post_id}`
                : v.username
                  ? `/@${v.username}`
                  : "/premium"
            }
            className={`notification ${!v.read_at ? "unread" : ""}`}
            key={v.id}
          >
            <div className="notification-icon">
              {icons[v.type] ?? <Sparkles size={16} />}
            </div>
            <Avatar name={v.display_name ?? "M"} id={v.avatar_id} />
            <div>
              <p>
                <b>{v.display_name ?? "M²"}</b>
                {count > 1 && ` и ещё ${count - 1}`} {labels[v.type] ?? v.type}
              </p>
              {v.text && <p className="muted">{v.text}</p>}
              <small>{date(v.created_at)}</small>
            </div>
            {!v.read_at && <i className="unread-dot" />}
          </Link>
        ))
      )}
    </>
  );
}
type Conversation = {
  id: string;
  user_id: string;
  username: string;
  display_name: string;
  avatar_id: string | null;
  last_message: string;
  unread: number;
};
type Message = {
  id: string;
  user_id: string;
  content: string;
  upload_id: string | null;
  created_at: number;
  read_at: number | null;
};
export function Messages() {
  const { user, t, run, notice } = useUI();
  const [params, setParams] = useSearchParams();
  const selected = params.get("conversation");
  const [search, setSearch] = useState("");
  const [text, setText] = useState("");
  const [image, setImage] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [cursor, setCursor] = useState<string | null>(null);
  const [older, setOlder] = useState<Message[]>([]);
  const list = useAPI<Conversation[]>(
    ["conversations"],
    "/conversations",
    true,
    15000,
  );
  const thread = useAPI<{ items: Message[]; next: string | null }>(
    ["messages", selected],
    `/conversations/${selected}/messages`,
    !!selected,
    10000,
  );
  const current = list.data?.find((c) => c.id === selected);
  useEffect(() => {
    setOlder([]);
    setCursor(null);
    setImage(null);
  }, [selected]);
  const messages = [...older, ...(thread.data?.items ?? [])].filter(
    (v, i, all) => all.findIndex((m) => m.id === v.id) === i,
  );
  return (
    <>
      <PageHeader title="Сообщения" />
      {!selected ? (
        <>
          <div className="message-search search-input">
            <SearchIcon size={18} />
            <input
              placeholder={t("Поиск")}
              aria-label="Поиск диалогов"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          {list.isPending ? (
            <Skeleton />
          ) : list.error ? (
            <ErrorState error={list.error} />
          ) : list.data?.length ? (
            list.data
              .filter((c) =>
                (c.display_name + c.username)
                  .toLowerCase()
                  .includes(search.toLowerCase()),
              )
              .map((c) => (
                <button
                  className="conversation"
                  key={c.id}
                  onClick={() => setParams({ conversation: c.id })}
                >
                  <Avatar name={c.display_name} id={c.avatar_id} />
                  <div>
                    <b>{c.display_name}</b>
                    <p>{c.last_message || "Начните разговор"}</p>
                  </div>
                  {c.unread > 0 && <span className="counter">{c.unread}</span>}
                  <ArrowUpRight size={16} />
                </button>
              ))
          ) : (
            <Empty
              icon={<MessageCircle />}
              text="Начните новую переписку из профиля пользователя."
            />
          )}
        </>
      ) : (
        <>
          <div className="thread-header">
            <button
              className="icon-button"
              aria-label={t("Назад")}
              onClick={() => setParams({})}
            >
              <ArrowLeft size={18} />
            </button>
            <Link to={`/@${current?.username ?? ""}`}>
              <b>{current?.display_name ?? t("Сообщения")}</b>
              <small>@{current?.username}</small>
            </Link>
          </div>
          <div className="message-thread">
            {(cursor ?? thread.data?.next) && (
              <button
                className="text-button older"
                onClick={() =>
                  void run(async () => {
                    const page = await api<{
                      items: Message[];
                      next: string | null;
                    }>(
                      `/conversations/${selected}/messages?before=${encodeURIComponent(cursor ?? thread.data?.next ?? "")}`,
                    );
                    setOlder((v) => [...page.items, ...v]);
                    setCursor(page.next ?? "");
                  })
                }
              >
                {t("Показать ещё")}
              </button>
            )}
            {thread.error ? (
              <ErrorState error={thread.error} />
            ) : (
              messages.map((m) => (
                <div
                  className={`message ${m.user_id === user?.id ? "own" : ""}`}
                  key={m.id}
                >
                  {m.upload_id && (
                    <a
                      href={`/media/${m.upload_id}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <img src={`/media/${m.upload_id}`} alt="Изображение" />
                    </a>
                  )}
                  <p>{m.content}</p>
                  <footer>
                    <time>
                      {new Date(m.created_at).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </time>
                    {m.user_id === user?.id && (
                      <>
                        <CheckCheck size={13} opacity={m.read_at ? 1 : 0.35} />
                        <button
                          className="icon-button"
                          aria-label={t("Удалить")}
                          onClick={() => {
                            if (confirm("Удалить сообщение?"))
                              void run(() =>
                                api(`/messages/${m.id}`, "DELETE"),
                              );
                          }}
                        >
                          <Trash2 size={12} />
                        </button>
                      </>
                    )}{" "}
                    {m.user_id !== user?.id && (
                      <button
                        className="icon-button"
                        aria-label={t("Пожаловаться")}
                        onClick={() => {
                          const reason = prompt(
                            "Причина жалобы (минимум 5 символов)",
                          );
                          if (reason)
                            void run(
                              () =>
                                api("/reports", "POST", {
                                  message_id: m.id,
                                  reason,
                                }),
                              "Сохранено",
                            );
                        }}
                      >
                        <Flag size={12} />
                      </button>
                    )}
                  </footer>
                </div>
              ))
            )}
          </div>
          <form
            className="message-compose"
            onSubmit={async (e) => {
              e.preventDefault();
              setSending(true);
              const ok = await run(() =>
                api(`/conversations/${selected}/messages`, "POST", {
                  content: text,
                  upload_id: image,
                }),
              );
              setSending(false);
              if (ok) {
                setText("");
                setImage(null);
              }
            }}
          >
            {image && (
              <button
                type="button"
                className="chip"
                onClick={() => setImage(null)}
              >
                1 фото ×
              </button>
            )}
            <label className="icon-button" title={t("Добавить фото")}>
              <ImagePlus size={19} />
              <input
                hidden
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const form = new FormData();
                  form.set("file", file);
                  try {
                    setImage(
                      (await api<{ id: string }>("/uploads", "POST", form)).id,
                    );
                  } catch (err) {
                    notice((err as Error).message);
                  }
                }}
              />
            </label>
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={t("Сообщение…")}
              aria-label={t("Сообщение…")}
              maxLength={2000}
            />
            <button
              className="button small"
              disabled={sending || (!text.trim() && !image)}
              aria-label={t("Отправить")}
            >
              <Send size={18} />
            </button>
          </form>
        </>
      )}
    </>
  );
}
export function Drafts() {
  const { t, run } = useUI();
  const [active, setActive] = useState<{ id: string; content: string } | null>(
    null,
  );
  const drafts = useAPI<{ id: string; content: string; updated_at: number }[]>(
    ["drafts"],
    "/drafts",
  );
  return (
    <>
      <PageHeader title="Черновики" />
      {drafts.isPending ? (
        <Skeleton />
      ) : drafts.error ? (
        <ErrorState error={drafts.error} />
      ) : !drafts.data?.length ? (
        <Empty
          icon={<FileText />}
          text="Сохраните мысль в редакторе, чтобы вернуться к ней позже."
        />
      ) : (
        drafts.data.map((d) => (
          <article className="draft-card" key={d.id}>
            <span className="eyebrow">{date(d.updated_at)}</span>
            <p>{d.content}</p>
            <div>
              <button className="text-button" onClick={() => setActive(d)}>
                {t("Продолжить")}
                <ArrowUpRight size={15} />
              </button>
              <button
                className="icon-button"
                aria-label={t("Удалить")}
                onClick={() => {
                  if (confirm("Удалить черновик?"))
                    void run(() => api(`/drafts/${d.id}`, "DELETE"));
                }}
              >
                <Trash2 size={17} />
              </button>
            </div>
          </article>
        ))
      )}
      {active && (
        <ComposeModal
          onClose={() => setActive(null)}
          initial={active.content}
          draftId={active.id}
        />
      )}
    </>
  );
}
export function Premium() {
  const { user, t, notice } = useUI();
  const features: Record<Tier, string[]> = {
    free: ["500 символов в публикации", "2 изображения", "1 закреплённый пост"],
    premium: [
      "2 000 символов · 4 изображения",
      "Баннер и оформление профиля",
      "3 закреплённых поста",
      "Реальная аналитика и история правок",
    ],
    premium_plus: [
      "5 000 символов · 6 изображений",
      "5 закреплённых постов",
      "Биография до 1 000 символов",
      "Все возможности Premium",
    ],
    elite: [
      "10 000 символов · 8 изображений",
      "10 закреплённых постов",
      "Биография до 2 000 символов",
      "Все возможности Premium+",
    ],
  };
  return (
    <>
      <PageHeader title="M² Premium" />
      <section className="premium-hero">
        <span className="premium-emblem">
          <Crown size={32} strokeWidth={1} />
        </span>
        <span className="eyebrow">{t("Без покупки. По приглашению.")}</span>
        <h2>{t("Откройте больше своего.")}</h2>
        <p>
          {t("Premium выдаёт администрация. Покупок и платежей на сайте нет.")}
        </p>
        {user && (
          <span className="chip">
            {t("Ваш уровень")}: {tierName(user.tier)}
          </span>
        )}
      </section>
      <div className="premium-plans">
        {(Object.keys(features) as Tier[]).map((tier, i) => (
          <article
            className={`premium-plan ${tier === user?.tier ? "current" : ""}`}
            key={tier}
          >
            <span className="plan-number">0{i + 1}</span>
            <div>
              <h3>
                {tierName(tier)}
                {tier === user?.tier && <Check size={16} />}
              </h3>
              <ul>
                {features[tier].map((f) => (
                  <li key={f}>
                    <Plus size={12} />
                    {f}
                  </li>
                ))}
              </ul>
            </div>
            <Badge tier={tier} />
          </article>
        ))}
      </div>
      {user?.tier !== "free" && user && (
        <div className="page-pad">
          <button
            className="button secondary"
            onClick={() =>
              void navigator.clipboard
                .writeText(
                  `Я в ${tierName(user.tier)}. Your Voice. Your Space. ${location.origin}/@${user.username}`,
                )
                .then(() => notice(t("Ссылка скопирована")))
            }
          >
            <Sparkles size={16} />
            Поделиться карточкой
          </button>
        </div>
      )}
      <p className="fine-print page-pad">
        Premium не меняет правила сообщества и не даёт административных прав.
        После окончания срока расширенные возможности отключаются автоматически.
      </p>
    </>
  );
}
type Analytics = {
  daily: { day: string; type: string; count: number }[];
  top: { id: string; content: string; views: number }[];
  followers: number;
};
export function AnalyticsPage() {
  const { user, t } = useUI();
  const [days, setDays] = useState(7);
  const data = useAPI<Analytics>(
    ["analytics", days],
    `/analytics?days=${days}`,
    user?.tier !== "free",
  );
  if (user?.tier === "free")
    return (
      <>
        <PageHeader title="Аналитика" />
        <Empty
          icon={<BarChart3 />}
          title="Больше пространства для роста"
          text="Аналитика доступна с Premium."
          action={
            <Link className="button" to="/premium">
              M² Premium
              <ArrowUpRight size={16} />
            </Link>
          }
        />
      </>
    );
  const d = data.data;
  const sum = (type: string) =>
    d?.daily.filter((v) => v.type === type).reduce((s, v) => s + v.count, 0) ??
    0;
  const timeline = Array.from({ length: days }, (_, i) => {
    const dt = new Date(Date.now() - (days - 1 - i) * 86400000)
      .toISOString()
      .slice(0, 10);
    return {
      day: dt,
      count:
        d?.daily
          .filter((v) => v.day === dt && v.type === "post_view")
          .reduce((s, v) => s + v.count, 0) ?? 0,
    };
  });
  const max = Math.max(1, ...timeline.map((v) => v.count));
  return (
    <>
      <PageHeader title="Аналитика">
        <select value={days} onChange={(e) => setDays(Number(e.target.value))}>
          <option value={7}>7 дней</option>
          <option value={30}>30 дней</option>
        </select>
      </PageHeader>
      {data.error ? (
        <ErrorState error={data.error} />
      ) : data.isPending ? (
        <Skeleton />
      ) : (
        <div className="page-pad">
          <div className="stats-grid">
            {[
              ["Просмотры", sum("post_view")],
              ["Посещения профиля", sum("profile_view")],
              ["Взаимодействия", sum("interaction")],
              ["Новые подписчики", sum("follow")],
            ].map(([label, value]) => (
              <div className="stat-box" key={label}>
                <small>{t(String(label))}</small>
                <b>{value}</b>
              </div>
            ))}
          </div>
          <h3>{t("Просмотры")}</h3>
          <div className="chart" aria-label="Просмотры публикаций по дням">
            {timeline.map((v) => (
              <div key={v.day} title={`${v.day}: ${v.count}`}>
                <span
                  style={{ height: `${Math.max(2, (v.count / max) * 100)}%` }}
                />
                <small>{v.day.slice(8)}</small>
              </div>
            ))}
          </div>
          <h3>Популярные публикации</h3>
          {d?.top.length ? (
            d.top.map((p) => (
              <Link className="analytics-post" key={p.id} to={`/post/${p.id}`}>
                <p>{p.content.slice(0, 120) || "Изображение"}</p>
                <b>{p.views}</b>
              </Link>
            ))
          ) : (
            <p className="muted">
              Данных ещё нет. Статистика появится после первых просмотров.
            </p>
          )}
          <p className="fine-print">
            Учитываются уникальные просмотры авторизованных пользователей за
            сутки. Собственные просмотры исключены. «Новые подписчики» — новые
            подписки за период, включая тех, кто позднее отписался.
          </p>
        </div>
      )}
    </>
  );
}
export function About() {
  const { t } = useUI();
  const platform = useAPI<{
    status: string;
    settings: { key: string; value: string }[];
  }>(["platform"], "/platform");
  return (
    <>
      <PageHeader title="О платформе" />
      <div className="about-content">
        <span className="giant-mark">
          M<sup>2</sup>
        </span>
        <span className="eyebrow">NEW POSTED</span>
        <h2>{t("Всё начинается с голоса.")}</h2>
        <p>{t("Место для мыслей, которые хочется разделить.")}</p>
        <h3>{t("Правила")}</h3>
        <p>
          {platform.data?.settings.find((v) => v.key === "rules")?.value ?? "…"}
        </p>
        <p className="live-label">
          <i />
          {platform.data
            ? t(
                platform.data.status === "maintenance"
                  ? "Техническое обслуживание"
                  : "Система работает",
              )
            : "Проверяем соединение…"}
        </p>
        <small className="muted">
          M² New Posted · 0.1.0 · Cloudflare Workers + D1
        </small>
      </div>
    </>
  );
}
export function NotFound() {
  const { t } = useUI();
  return (
    <Empty
      title="Страница не найдена"
      text="Возможно, ссылка устарела. Здесь всегда есть место для нового начала."
      action={
        <Link className="button" to="/">
          {t("Вернуться в ленту")}
        </Link>
      }
    />
  );
}
export const Bookmarks = () => {
  const { t } = useUI();
  return (
    <>
      <PageHeader title="Закладки" />
      <Feed
        path="/feed?mode=bookmarks"
        emptyText={t("Вы ещё не сохранили ни одной публикации.")}
      />
    </>
  );
};
export const Protected = ({ children }: { children: React.ReactNode }) => (
  <Gate>{children}</Gate>
);
