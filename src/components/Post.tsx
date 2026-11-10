import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import {
  Heart,
  MessageCircle,
  Repeat2,
  Bookmark,
  MoreHorizontal,
  Link2,
  Flag,
  Pencil,
  Trash2,
  Pin,
  Quote,
  EyeOff,
  Ban,
  History,
  Check,
} from "lucide-react";
import { motion } from "motion/react";
import { api, useUI, useAPI, type Post, mediaIds, timeAgo } from "../lib";
import { Avatar, Badge, Modal } from "./common";
import { ComposeModal, HistoryModal } from "./Composer";
export function RichText({ text }: { text: string }) {
  return (
    <>
      {text.split(/(@[a-zA-Z0-9_]+|#[\p{L}\p{N}_]+)/gu).map((s, i) =>
        s.startsWith("@") ? (
          <Link key={i} to={`/${s}`} className="inline-link">
            {s}
          </Link>
        ) : s.startsWith("#") ? (
          <Link
            key={i}
            to={`/search?q=${encodeURIComponent(s)}`}
            className="inline-link"
          >
            {s}
          </Link>
        ) : (
          s
        ),
      )}
    </>
  );
}
function QuotePreview({ id }: { id: string }) {
  const p = useAPI<Post>(["post", id], `/posts/${id}`);
  return (
    <Link to={`/post/${id}`} className="quote-box">
      {p.data ? (
        <>
          <b>@{p.data.username}</b>
          <p>{p.data.content.slice(0, 300)}</p>
        </>
      ) : (
        <span className="muted">{p.error ? "Публикация недоступна" : "…"}</span>
      )}
    </Link>
  );
}
export function PostCard({
  post,
  detail = false,
}: {
  post: Post;
  detail?: boolean;
}) {
  const { user, t, run, authenticate, notice } = useUI();
  const navigate = useNavigate();
  const [dialog, setDialog] = useState<
    "reply" | "quote" | "edit" | "report" | "history" | null
  >(null);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLElement>(null);
  const viewed = useRef(false);
  const own = user?.id === post.user_id;
  useEffect(() => {
    if (!user || !ref.current || viewed.current) return;
    const obs = new IntersectionObserver(
      (es) => {
        if (es[0].isIntersecting) {
          viewed.current = true;
          void api(`/posts/${post.id}/view`, "POST").catch(() => {});
          obs.disconnect();
        }
      },
      { threshold: 0.7 },
    );
    obs.observe(ref.current);
    return () => obs.disconnect();
  }, [user?.id, post.id]);
  const react = async (type: string, active: boolean) => {
    if (!user) {
      authenticate();
      return;
    }
    if (busy) return;
    setBusy(true);
    await run(() =>
      api(`/posts/${post.id}/${type}`, active ? "DELETE" : "PUT"),
    );
    setBusy(false);
  };
  const copy = () =>
    void navigator.clipboard
      .writeText(`${location.origin}/post/${post.id}`)
      .then(() => notice(t("Ссылка скопирована")))
      .catch(() => notice("Не удалось скопировать ссылку"));
  const menu = (value: typeof dialog) => {
    if (!user) authenticate();
    else setDialog(value);
  };
  return (
    <motion.article
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className={`post-card ${detail ? "post-detail" : ""}`}
      ref={ref}
    >
      {!!post.pinned && (
        <div className="pinned-label">
          <Pin size={12} />
          {t("Закрепить")}
        </div>
      )}
      <div className="post-row">
        <Link to={`/@${post.username}`} className="avatar-link">
          <Avatar name={post.display_name} id={post.avatar_id} />
        </Link>
        <div className="post-content">
          <div className="post-header">
            <div className="post-author">
              <Link to={`/@${post.username}`} className="display-name">
                {post.display_name}
              </Link>
              <Badge tier={post.tier} />
              <Link to={`/@${post.username}`} className="username">
                @{post.username}
              </Link>
              <span className="dot">·</span>
              <Link
                to={`/post/${post.id}`}
                className="post-time"
                title={new Date(post.created_at).toLocaleString()}
              >
                {timeAgo(post.created_at)}
              </Link>
            </div>
            <details className="post-menu">
              <summary
                className="icon-button"
                aria-label="Действия с публикацией"
              >
                <MoreHorizontal size={19} />
              </summary>
              <div
                className="menu"
                onClick={(e) => {
                  const details = e.currentTarget.closest("details");
                  if (details) details.open = false;
                }}
              >
                <button onClick={copy}>
                  <Link2 size={15} />
                  {t("Скопировать ссылку")}
                </button>
                <button onClick={() => menu("quote")}>
                  <Quote size={15} />
                  {t("Цитировать")}
                </button>
                {own ? (
                  <>
                    <button onClick={() => menu("edit")}>
                      <Pencil size={15} />
                      {t("Редактировать")}
                    </button>
                    <button
                      onClick={() =>
                        void run(() =>
                          api(`/posts/${post.id}/pin`, "POST", {
                            pinned: !post.pinned,
                          }),
                        )
                      }
                    >
                      <Pin size={15} />
                      {t(post.pinned ? "Открепить" : "Закрепить")}
                    </button>
                    {user?.tier !== "free" && (
                      <button onClick={() => menu("history")}>
                        <History size={15} />
                        {t("История изменений")}
                      </button>
                    )}
                    <button
                      onClick={() => {
                        if (
                          confirm(
                            `${t("Удалить публикацию?")} ${t("Это действие нельзя отменить.")}`,
                          )
                        )
                          void run(async () => {
                            await api(`/posts/${post.id}`, "DELETE");
                            if (detail) navigate("/");
                          }, "Удалено");
                      }}
                    >
                      <Trash2 size={15} />
                      {t("Удалить")}
                    </button>
                  </>
                ) : (
                  <>
                    <button onClick={() => menu("report")}>
                      <Flag size={15} />
                      {t("Пожаловаться")}
                    </button>
                    <button
                      onClick={() => {
                        if (!user) authenticate();
                        else
                          void run(
                            () => api(`/users/${post.user_id}/mute`, "PUT"),
                            "Сохранено",
                          );
                      }}
                    >
                      <EyeOff size={15} />
                      {t("Скрыть автора")}
                    </button>
                    <button
                      onClick={() => {
                        if (!user) authenticate();
                        else if (
                          confirm(`${t("Заблокировать")} @${post.username}?`)
                        )
                          void run(
                            () => api(`/users/${post.user_id}/block`, "PUT"),
                            "Сохранено",
                          );
                      }}
                    >
                      <Ban size={15} />
                      {t("Заблокировать")}
                    </button>
                  </>
                )}
              </div>
            </details>
          </div>
          <div className="post-text">
            <RichText text={post.content} />
          </div>
          {post.quote_id && <QuotePreview id={post.quote_id} />}
          {mediaIds(post.media).length > 0 && (
            <div
              className={`post-media media-count-${mediaIds(post.media).length}`}
            >
              {mediaIds(post.media).map((mid) => (
                <a
                  href={`/media/${mid}`}
                  target="_blank"
                  rel="noreferrer"
                  key={mid}
                >
                  <img
                    src={`/media/${mid}`}
                    alt="Изображение публикации"
                    loading="lazy"
                  />
                </a>
              ))}
            </div>
          )}
          {post.edited_at && <small className="edited">изменено</small>}
          <div className="post-actions">
            <button
              aria-label={t("Нравится")}
              className={post.liked ? "selected" : ""}
              onClick={() => void react("like", !!post.liked)}
              disabled={busy}
            >
              <Heart size={18} fill={post.liked ? "currentColor" : "none"} />
              <span>{post.likes || ""}</span>
            </button>
            <button aria-label={t("Ответить")} onClick={() => menu("reply")}>
              <MessageCircle size={18} />
              <span>{post.replies || ""}</span>
            </button>
            <button
              aria-label={t("Репосты")}
              className={post.reposted ? "selected" : ""}
              onClick={() => void react("repost", !!post.reposted)}
              disabled={busy}
            >
              <Repeat2 size={18} />
              <span>{post.reposts || ""}</span>
            </button>
            <button
              aria-label={t("Закладки")}
              className={`bookmark-action ${post.bookmarked ? "selected" : ""}`}
              onClick={() => void react("bookmark", !!post.bookmarked)}
              disabled={busy}
            >
              <Bookmark
                size={17}
                fill={post.bookmarked ? "currentColor" : "none"}
              />
            </button>
            <button aria-label={t("Скопировать ссылку")} onClick={copy}>
              <Link2 size={17} />
            </button>
          </div>
        </div>
      </div>
      {(dialog === "reply" || dialog === "quote") && (
        <ComposeModal
          onClose={() => setDialog(null)}
          parent={dialog === "reply" ? post : undefined}
          quote={dialog === "quote" ? post : undefined}
        />
      )}{" "}
      {dialog === "history" && (
        <HistoryModal post={post} onClose={() => setDialog(null)} />
      )}
      {(dialog === "edit" || dialog === "report") && (
        <Modal
          title={t(dialog === "edit" ? "Редактировать" : "Пожаловаться")}
          onClose={() => setDialog(null)}
        >
          <form
            className="form modal-form"
            onSubmit={async (e) => {
              e.preventDefault();
              const value = new FormData(e.currentTarget).get("value");
              setBusy(true);
              const ok = await run(
                () =>
                  dialog === "edit"
                    ? api(`/posts/${post.id}`, "PATCH", { content: value })
                    : api("/reports", "POST", {
                        post_id: post.id,
                        target_user_id: post.user_id,
                        reason: value,
                      }),
                "Сохранено",
              );
              setBusy(false);
              if (ok) setDialog(null);
            }}
          >
            <textarea
              name="value"
              aria-label={t(dialog === "edit" ? "Публикации" : "Причина")}
              defaultValue={dialog === "edit" ? post.content : ""}
              required
              minLength={dialog === "edit" ? 1 : 5}
              maxLength={dialog === "edit" ? 10000 : 1000}
              rows={5}
            />
            <button className="button" disabled={busy}>
              <Check size={16} />
              {t("Сохранить")}
            </button>
          </form>
        </Modal>
      )}
    </motion.article>
  );
}
