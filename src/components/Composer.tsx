import { useRef, useState, type FormEvent } from "react";
import { ImagePlus, Smile, X, Eye, FileText, Send } from "lucide-react";
import { useNavigate } from "react-router";
import { api, useUI, limits, useAPI, type Post, type Profile } from "../lib";
import { Avatar, Modal } from "./common";
export function Composer({
  onClose,
  parent,
  quote,
  initial = "",
  draftId,
}: {
  onClose?: () => void;
  parent?: Post;
  quote?: Post;
  initial?: string;
  draftId?: string;
}) {
  const { user, t, run, notice, authenticate } = useUI();
  const [content, setContent] = useState(initial);
  const [media, setMedia] = useState<string[]>([]);
  const [permission, setPermission] = useState("everyone");
  const [pending, setPending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState(false);
  const [emoji, setEmoji] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const max = limits[user?.tier ?? "free"];
  const count = [...content].length;
  const maxImages = { free: 2, premium: 4, premium_plus: 6, elite: 8 }[
    user?.tier ?? "free"
  ];
  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    if (!user) {
      authenticate();
      return;
    }
    if (media.length + files.length > maxImages) {
      notice(`Максимум ${maxImages} изображения`);
      return;
    }
    setUploading(true);
    try {
      const ids: string[] = [];
      for (const file of Array.from(files)) {
        const f = new FormData();
        f.set("file", file);
        ids.push((await api<{ id: string }>("/uploads", "POST", f)).id);
      }
      setMedia((v) => [...v, ...ids]);
    } catch (e) {
      notice((e as Error).message);
    } finally {
      setUploading(false);
    }
  };
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!user) {
      authenticate();
      return;
    }
    setPending(true);
    const ok = await run(async () => {
      await api("/posts", "POST", {
        content,
        media,
        parent_id: parent?.id ?? null,
        quote_id: quote?.id ?? null,
        reply_permission: permission,
      });
      if (draftId) await api(`/drafts/${draftId}`, "DELETE");
    }, "Опубликовано");
    setPending(false);
    if (ok) {
      setContent("");
      setMedia([]);
      onClose?.();
      if (parent) navigate(`/post/${parent.id}`);
    }
  };
  return (
    <form
      className={`composer ${onClose ? "composer-modal" : ""}`}
      onSubmit={submit}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        void upload(e.dataTransfer.files);
      }}
    >
      <Avatar name={user?.display_name ?? "M"} id={user?.avatar_id} />
      <div className="composer-main">
        {onClose && (
          <div className="composer-author">
            {user?.display_name}
            <span>@{user?.username}</span>
          </div>
        )}
        {parent && (
          <div className="reply-context">
            {t("Ответить")} @{parent.username}
          </div>
        )}
        {preview ? (
          <div className="composer-preview">{content || t("Предпросмотр")}</div>
        ) : (
          <textarea
            aria-label={t("Что нового?")}
            placeholder={t(parent ? "Ответить" : "Что нового?")}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            maxLength={max * 2}
            rows={onClose ? 5 : 2}
            onFocus={() => !user && authenticate()}
          />
        )}
        {quote && (
          <div className="quote-box">
            <b>@{quote.username}</b>
            <p>{quote.content}</p>
          </div>
        )}
        {media.length > 0 && (
          <div className="composer-media">
            {media.map((mid) => (
              <div key={mid}>
                <img src={`/media/${mid}`} alt="Загружаемое изображение" />
                <button
                  type="button"
                  className="icon-button"
                  aria-label={t("Удалить")}
                  onClick={() => setMedia(media.filter((id) => id !== mid))}
                >
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
        {uploading && <p className="muted">Загрузка…</p>}
        <div className="composer-bottom">
          <div className="composer-tools">
            <input
              type="file"
              hidden
              multiple
              accept="image/png,image/jpeg,image/webp"
              ref={input}
              onChange={(e) => void upload(e.target.files)}
            />
            <button
              type="button"
              className="icon-button"
              title={`${t("Добавить фото")} · PNG, JPEG, WebP · 500 КБ`}
              aria-label={t("Добавить фото")}
              onClick={() => input.current?.click()}
              disabled={uploading}
            >
              <ImagePlus size={18} />
            </button>
            <button
              type="button"
              className="icon-button"
              aria-label="Эмодзи"
              onClick={() => setEmoji(!emoji)}
            >
              <Smile size={18} />
            </button>
            <button
              type="button"
              className={`icon-button ${preview ? "active" : ""}`}
              aria-label={t("Предпросмотр")}
              onClick={() => setPreview(!preview)}
            >
              <Eye size={18} />
            </button>
            {onClose && (
              <button
                type="button"
                className="icon-button"
                title={t("Сохранить черновик")}
                aria-label={t("Сохранить черновик")}
                disabled={!content.trim() || count > max || pending}
                onClick={() =>
                  void run(async () => {
                    await api("/drafts", "POST", { content });
                    onClose();
                  }, "Сохранено")
                }
              >
                <FileText size={18} />
              </button>
            )}
          </div>
          <div className="composer-submit">
            <span className={`char-count ${count > max ? "over" : ""}`}>
              {content.length > 0 ? `${count} / ${max}` : ""}
            </span>
            <button
              className="button small"
              disabled={
                pending ||
                uploading ||
                count > max ||
                (!content.trim() && !media.length)
              }
            >
              {pending ? "…" : t(parent ? "Ответить" : "Опубликовать")}
              <Send size={13} />
            </button>
          </div>
        </div>
        {emoji && (
          <div className="emoji-picker">
            {["🤍", "✨", "🙌", "💭", "🖤", "👀", "✌️", "🔥"].map((e) => (
              <button
                type="button"
                key={e}
                onClick={() => {
                  setContent(content + e);
                  setEmoji(false);
                }}
              >
                {e}
              </button>
            ))}
          </div>
        )}
        {onClose && (
          <select
            className="reply-select"
            aria-label="Разрешения на ответы"
            value={permission}
            onChange={(e) => setPermission(e.target.value)}
          >
            <option value="everyone">{t("Все могут отвечать")}</option>
            <option value="following">{t("Только ваши подписки")}</option>
            <option value="nobody">{t("Ответы закрыты")}</option>
          </select>
        )}
      </div>
    </form>
  );
}
export function ComposeModal({
  onClose,
  parent,
  quote,
  initial,
  draftId,
}: {
  onClose: () => void;
  parent?: Post;
  quote?: Post;
  initial?: string;
  draftId?: string;
}) {
  const { t } = useUI();
  return (
    <Modal title={t(parent ? "Ответить" : "Создать пост")} onClose={onClose}>
      <Composer
        onClose={onClose}
        parent={parent}
        quote={quote}
        initial={initial}
        draftId={draftId}
      />
    </Modal>
  );
}
export function EditProfile({
  profile,
  onClose,
}: {
  profile: Profile;
  onClose: () => void;
}) {
  const { t, run, notice } = useUI();
  const [avatar, setAvatar] = useState(profile.avatar_id);
  const [banner, setBanner] = useState(
    profile.tier === "free" ? null : profile.banner_id,
  );
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const upload = async (file: File | undefined, kind: string) => {
    if (!file) return;
    setBusy(true);
    try {
      const f = new FormData();
      f.set("file", file);
      const u = await api<{ id: string }>("/uploads", "POST", f);
      if (kind === "avatar") setAvatar(u.id);
      else setBanner(u.id);
    } catch (e) {
      notice((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title={t("Редактировать профиль")} onClose={onClose}>
      <form
        className="form modal-form"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          const f = new FormData(e.currentTarget);
          const data = Object.fromEntries(f);
          const ok = await run(
            () =>
              api("/profile", "PATCH", {
                ...data,
                private: f.get("private") === "on",
                avatar_id: avatar,
                banner_id: banner,
              }),
            "Сохранено",
          );
          setBusy(false);
          if (ok) {
            navigate(`/@${data.username}`);
            onClose();
          }
        }}
      >
        <div className="profile-image-inputs">
          <label>
            {t("Аватар")}
            <Avatar name={profile.display_name} id={avatar} />
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(e) => void upload(e.target.files?.[0], "avatar")}
            />
          </label>
          {profile.tier !== "free" && (
            <label>
              {t("Баннер")}
              {banner && (
                <img
                  src={`/media/${banner}`}
                  alt="Баннер"
                  className="banner-preview"
                />
              )}
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={(e) => void upload(e.target.files?.[0], "banner")}
              />
            </label>
          )}
        </div>
        <label>
          {t("Имя")}
          <input
            name="display_name"
            defaultValue={profile.display_name}
            required
            maxLength={60}
          />
        </label>
        <label>
          {t("Имя пользователя")}
          <input
            name="username"
            defaultValue={profile.username}
            pattern="[a-zA-Z0-9_]{3,24}"
            required
          />
        </label>
        <label>
          {t("Биография")}
          <textarea
            name="bio"
            defaultValue={profile.bio}
            maxLength={
              { free: 160, premium: 500, premium_plus: 1000, elite: 2000 }[
                profile.tier
              ]
            }
          />
        </label>
        <label>
          {t("Сайт")}
          <input
            name="website"
            type="url"
            defaultValue={profile.website}
            maxLength={200}
            placeholder="https://"
          />
        </label>
        {profile.tier !== "free" && (
          <>
            <label>
              {t("Статус")}
              <input
                name="status"
                defaultValue={profile.status}
                maxLength={60}
              />
            </label>
            <label>
              {t("Внешний вид")}
              <select name="style" defaultValue={profile.style}>
                <option value="classic">Classic</option>
                <option value="outline">Outline</option>
                <option value="editorial">Editorial</option>
              </select>
            </label>
          </>
        )}
        <label className="checkbox">
          <input
            type="checkbox"
            name="private"
            defaultChecked={!!profile.private}
          />
          {t("Приватный профиль")}
          <small>Публикации видны только вам.</small>
        </label>
        <label>
          {t("Личные сообщения")}
          <select name="allow_messages" defaultValue={profile.allow_messages}>
            <option value="everyone">{t("От всех")}</option>
            <option value="following">{t("От ваших подписок")}</option>
            <option value="nobody">{t("Ни от кого")}</option>
          </select>
        </label>
        <button className="button" disabled={busy}>
          {busy ? "…" : t("Сохранить")}
        </button>
      </form>
    </Modal>
  );
}
export function HistoryModal({
  post,
  onClose,
}: {
  post: Post;
  onClose: () => void;
}) {
  const { t } = useUI();
  const h = useAPI<{ content: string; edited_at: number }[]>(
    ["history", post.id],
    `/posts/${post.id}/history`,
  );
  return (
    <Modal title={t("История изменений")} onClose={onClose}>
      <div className="modal-form">
        {h.error ? (
          <p>{h.error.message}</p>
        ) : h.data?.length ? (
          h.data.map((v, i) => (
            <article className="history-item" key={i}>
              <small>{new Date(v.edited_at).toLocaleString()}</small>
              <p>{v.content}</p>
            </article>
          ))
        ) : (
          <p className="muted">Изменений пока нет.</p>
        )}
      </div>
    </Modal>
  );
}
