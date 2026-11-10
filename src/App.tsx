import { useState, useEffect, lazy, Suspense, type ComponentType } from "react";
import {
  NavLink,
  Link,
  Route,
  Routes,
  useLocation,
  Navigate,
} from "react-router";
import {
  Home as HomeIcon,
  Search,
  Bell,
  MessageCircle,
  Bookmark,
  UserRound,
  Settings,
  ShieldCheck,
  Plus,
  ArrowUpRight,
  FileText,
  BarChart3,
  Crown,
  Globe2,
  ChevronDown,
  X,
  Asterisk,
} from "lucide-react";
import { useUI, useAPI } from "./lib";
import type { Profile } from "./lib";
import {
  Home,
  SearchPage,
  ProfilePage,
  PostPage,
  Notifications,
  Messages,
  Drafts,
  Premium,
  AnalyticsPage,
  About,
  NotFound,
  Bookmarks,
  Protected,
  Person,
} from "./pages";
const SettingsPage = lazy(() =>
  import("./Settings").then((m) => ({ default: m.SettingsPage })),
);
const Admin = lazy(() => import("./Admin").then((m) => ({ default: m.Admin })));
import { Avatar, Logo, Modal, Skeleton } from "./components/common";
import { AuthModal, ResetPage } from "./components/Auth";
import { ComposeModal } from "./components/Composer";
export default function App() {
  const { user, authenticate, t, notice } = useUI();
  const [compose, setCompose] = useState(false);
  const location = useLocation();
  const [announcementClosed, setAnnouncementClosed] = useState(false);
  const [rules, setRules] = useState(false);
  const counts = useAPI<{ notifications: number; messages: number }>(
    ["counts"],
    "/counts",
    !!user,
    30000,
  );
  const people = useAPI<Profile[]>(["people", "sidebar"], "/people");
  const topics = useAPI<{ tag: string; count: number }[]>(
    ["topics"],
    "/topics",
  );
  const platform = useAPI<{
    status: string;
    settings: { key: string; value: string }[];
  }>(["platform"], "/platform");
  const platformName =
    platform.data?.settings.find((s) => s.key === "name")?.value ??
    "M² New Posted";
  useEffect(() => {
    document.title = platformName;
  }, [platformName]);
  const announcement = platform.data?.settings.find(
    (s) => s.key === "announcement",
  )?.value;
  const nav: [
    string,
    string,
    ComponentType<{ size?: number; strokeWidth?: number }>,
  ][] = [
    ["/", "Главная", HomeIcon],
    ["/search", "Поиск", Search],
    ["/notifications", "Уведомления", Bell],
    ["/messages", "Сообщения", MessageCircle],
    ["/bookmarks", "Закладки", Bookmark],
    [user ? `/@${user.username}` : "/profile", "Профиль", UserRound],
  ];
  const openComposer = () => (user ? setCompose(true) : authenticate());
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        Перейти к содержимому
      </a>
      <aside className="sidebar">
        <Logo />
        <nav className="main-nav" aria-label="Основная навигация">
          {nav.map(([path, label, Icon]) => (
            <NavLink
              key={path}
              to={path}
              end={path === "/"}
              className={({ isActive }) =>
                `nav-item ${isActive ? "active" : ""}`
              }
            >
              <Icon size={22} strokeWidth={1.7} />
              <span>{t(label)}</span>
              {label === "Уведомления" && !!counts.data?.notifications && (
                <b className="nav-count">{counts.data.notifications}</b>
              )}
              {label === "Сообщения" && !!counts.data?.messages && (
                <b className="nav-count">{counts.data.messages}</b>
              )}
            </NavLink>
          ))}
        </nav>
        <button className="button create-button" onClick={openComposer}>
          <Plus size={20} />
          {t("Создать пост")}
        </button>
        <div className="sidebar-extra">
          <Link to="/premium">
            <Crown size={18} />
            <span>M² Premium</span>
            <ArrowUpRight size={14} />
          </Link>
          {user && (
            <>
              <Link to="/drafts">
                <FileText size={18} />
                <span>{t("Черновики")}</span>
              </Link>
              <Link to="/analytics">
                <BarChart3 size={18} />
                <span>{t("Аналитика")}</span>
              </Link>
            </>
          )}
          <Link to="/settings">
            <Settings size={18} />
            <span>{t("Настройки")}</span>
          </Link>
          {user && user.role !== "user" && (
            <Link to="/admin">
              <ShieldCheck size={18} />
              <span>{t("Администрирование")}</span>
            </Link>
          )}
        </div>
        <div className="sidebar-bottom">
          <span className="sidebar-tagline">
            YOUR VOICE.
            <br />
            YOUR SPACE.
          </span>
          {user ? (
            <Link className="account-button" to="/settings">
              <Avatar
                name={user.display_name}
                id={user.avatar_id}
                size="small"
              />
              <span>
                <b>{user.display_name}</b>
                <small>@{user.username}</small>
              </span>
              <ChevronDown size={14} />
            </Link>
          ) : (
            <button className="button secondary" onClick={authenticate}>
              {t("Войти")}
              <ArrowUpRight size={16} />
            </button>
          )}
          <p className="copyright">
            M² NEW POSTED © {new Date().getFullYear()}
          </p>
        </div>
      </aside>
      <div className="mobile-header">
        <Logo />
        <button
          className="icon-button"
          aria-label={t(user ? "Профиль" : "Войти")}
          onClick={() =>
            user
              ? location.pathname !== `/@${user.username}`
                ? window.location.assign(`/@${user.username}`)
                : null
              : authenticate()
          }
        >
          <Avatar
            name={user?.display_name ?? "M"}
            id={user?.avatar_id}
            size="small"
          />
        </button>
      </div>
      <main id="main" className="main-column">
        {announcement && !announcementClosed && (
          <div className="announcement">
            {announcement}
            <button
              className="icon-button"
              aria-label="Закрыть объявление"
              onClick={() => setAnnouncementClosed(true)}
            >
              <X size={14} />
            </button>
          </div>
        )}
        <Suspense fallback={<Skeleton />}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/search" element={<SearchPage />} />
            <Route path="/post/:id" element={<PostPage />} />
            <Route
              path="/profile"
              element={
                <Protected>
                  {user && <Navigate to={`/@${user.username}`} replace />}
                </Protected>
              }
            />
            <Route
              path="/notifications"
              element={
                <Protected>
                  <Notifications />
                </Protected>
              }
            />
            <Route
              path="/messages"
              element={
                <Protected>
                  <Messages />
                </Protected>
              }
            />
            <Route
              path="/bookmarks"
              element={
                <Protected>
                  <Bookmarks />
                </Protected>
              }
            />
            <Route
              path="/drafts"
              element={
                <Protected>
                  <Drafts />
                </Protected>
              }
            />
            <Route
              path="/analytics"
              element={
                <Protected>
                  <AnalyticsPage />
                </Protected>
              }
            />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/premium" element={<Premium />} />
            <Route
              path="/admin/*"
              element={
                <Protected>
                  <Admin />
                </Protected>
              }
            />
            <Route path="/about" element={<About />} />
            <Route path="/reset" element={<ResetPage />} />
            <Route path="/:username" element={<ProfilePage />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </main>
      <aside className="right-column">
        <Link to="/search" className="right-search">
          <Search size={17} />
          <span>{t("Поиск")}</span>
          <ArrowUpRight size={15} />
        </Link>
        <section className="editorial-card">
          <span className="eyebrow">LESS SCROLL. MORE SOUL.</span>
          <div className="editorial-symbol">
            m<sup>2</sup>
          </div>
          <h2>
            Мысли
            <br />
            имеют
            <br />
            <span>значение.</span>
          </h2>
          <div className="editorial-footer">
            <span>
              MAKE ROOM
              <br />
              FOR YOUR VOICE.
            </span>
            <ArrowUpRight size={28} strokeWidth={1} />
          </div>
        </section>
        <section className="right-section">
          <div className="section-title">
            <h3>{t("Люди рядом")}</h3>
            <Link to="/search" aria-label={t("Поиск")}>
              <ArrowUpRight size={17} />
            </Link>
          </div>
          {people.data?.length ? (
            people.data.slice(0, 3).map((p) => <Person key={p.id} person={p} />)
          ) : (
            <div className="right-empty">
              <Globe2 size={22} strokeWidth={1} />
              <p>{t("Найдите своих")}</p>
              <small>
                {t("Пользователи появятся здесь после регистрации.")}
              </small>
            </div>
          )}
        </section>
        <section className="right-section topics">
          <div className="section-title">
            <h3>{t("Темы дня")}</h3>
            <span className="mini-star">
              <Asterisk size={18} />
            </span>
          </div>
          {topics.data?.length ? (
            topics.data.map((topic, i) => (
              <Link
                to={`/search?q=${encodeURIComponent("#" + topic.tag)}`}
                key={topic.tag}
              >
                <span className="topic-index">0{i + 1}</span>
                <div>
                  <b>#{topic.tag}</b>
                  <small>
                    {topic.count} {t("публикаций")}
                  </small>
                </div>
                <ArrowUpRight size={15} />
              </Link>
            ))
          ) : (
            <p className="muted right-empty-topic">
              {t("Пока без хештегов")}
              <br />
              <small>Каждая большая тема начинается с одной мысли.</small>
            </p>
          )}
        </section>
        <button
          className="invite-button"
          onClick={() =>
            void navigator.clipboard
              .writeText(window.location.origin)
              .then(() => notice(t("Ссылка на приглашение скопирована")))
          }
        >
          {t("Пригласить друзей")}
          <ArrowUpRight size={15} />
        </button>
        <footer className="right-footer">
          <div>
            <Link to="/about">{t("О платформе")}</Link>
            <button onClick={() => setRules(true)}>{t("Правила")}</button>
            <Link to="/settings">{t("Настройки")}</Link>
          </div>
          <span className="system-status">
            <i />
            {platform.data
              ? t(
                  platform.data.status === "maintenance"
                    ? "Техническое обслуживание"
                    : "Система работает",
                )
              : "Подключение…"}
          </span>
        </footer>
      </aside>
      <nav className="mobile-nav" aria-label="Мобильная навигация">
        <NavLink to="/" aria-label={t("Главная")}>
          <HomeIcon size={22} />
        </NavLink>
        <NavLink to="/search" aria-label={t("Поиск")}>
          <Search size={22} />
        </NavLink>
        <button
          className="mobile-create"
          onClick={openComposer}
          aria-label={t("Создать пост")}
        >
          <Plus size={25} />
        </button>
        <NavLink to="/notifications" aria-label={t("Уведомления")}>
          <Bell size={22} />
          {!!counts.data?.notifications && <i className="nav-dot" />}
        </NavLink>
        <NavLink
          to={user ? `/@${user.username}` : "/profile"}
          aria-label={t("Профиль")}
        >
          <UserRound size={22} />
        </NavLink>
      </nav>
      {compose && <ComposeModal onClose={() => setCompose(false)} />}
      <AuthModal />
      {rules && (
        <Modal title={t("Правила")} onClose={() => setRules(false)}>
          <div className="modal-form rules-text">
            {platform.data?.settings.find((s) => s.key === "rules")?.value ??
              "Уважайте друг друга."}
          </div>
        </Modal>
      )}
    </div>
  );
}
