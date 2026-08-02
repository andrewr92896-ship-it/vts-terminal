import { useCallback, useEffect, useState, type CSSProperties } from 'react';
import { api, ApiError } from '../../api/client';
import type { DevBlogPost } from '../../api/types';
import type { Theme } from '../../theme/themes';
import { C } from '../../theme/tokens';
import { Icon } from '../../components/Icon';
import { SectionHeader, panel, panelLabel } from './adminUi';

// Developer Terminal ▸ Developer Blog — the idea board.
//
// A message board rather than a changelog: posts are ideas in progress, and both
// the owner and the terminal's own development account write in it. Founder-level
// throughout, reads included.
//
// A post marked VTS Development came from Claude Code. Those arrive with a
// deploy rather than in real time — Claude Code edits the repository and has no
// session to post through — so they read as notes left between sessions. A
// founder can also post under that name from here, which is what the "Post as
// VTS Development" tick does.

const DEV_AVATAR = '/brand/vts-development.svg';

export function DevBlog({ theme }: { theme: Theme }) {
  const [posts, setPosts] = useState<DevBlogPost[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);
  const [busy, setBusy] = useState(false);

  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [asDev, setAsDev] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await api.devBlog();
      setPosts(r.posts);
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not load the blog');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function submit() {
    if (!title.trim() || !body.trim() || busy) return;
    setBusy(true);
    try {
      const r = await api.createDevBlogPost({ title, body, asDevelopment: asDev });
      setPosts(r.posts);
      setTitle('');
      setBody('');
      setAsDev(false);
      setComposing(false);
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not post that');
    } finally {
      setBusy(false);
    }
  }

  async function run(p: Promise<{ posts: DevBlogPost[] }>) {
    try {
      setPosts((await p).posts);
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Something went wrong');
    }
  }

  return (
    <div style={{ maxWidth: 820, margin: '0 auto', padding: '24px 20px 40px' }}>
      <SectionHeader
        title="Developer Blog"
        subtitle="Ideas in progress. Posts marked VTS Development come from Claude Code and arrive with a deploy."
      />

      {error && <div style={errorBox}>{error}</div>}

      {!composing ? (
        <button onClick={() => setComposing(true)} style={primaryBtn}>
          {"New post"}
        </button>
      ) : (
        <section style={{ ...panel(theme), marginBottom: 16 }}>
          <div style={panelLabel}>{"New post"}</div>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Title"
            style={input}
          />
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="What's the idea?"
            rows={6}
            style={{ ...input, marginTop: 10, resize: 'vertical', fontFamily: 'inherit' }}
          />
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              marginTop: 10,
              fontSize: 12.5,
              color: C.muted,
              cursor: 'pointer',
            }}
          >
            <input type="checkbox" checked={asDev} onChange={(e) => setAsDev(e.target.checked)} />
            {"Post as VTS Development"}
          </label>
          <div style={{ display: 'flex', gap: 9, marginTop: 14, flexWrap: 'wrap' }}>
            <button
              onClick={() => void submit()}
              disabled={busy || !title.trim() || !body.trim()}
              style={{ ...primaryBtn, opacity: busy || !title.trim() || !body.trim() ? 0.55 : 1 }}
            >
              {busy ? 'Posting…' : 'Post'}
            </button>
            <button onClick={() => setComposing(false)} style={ghostBtn}>
              {"Cancel"}
            </button>
          </div>
        </section>
      )}

      {posts == null && !error && (
        <div style={{ color: C.muted, fontSize: 13, marginTop: 16 }}>Loading…</div>
      )}

      {posts != null && posts.length === 0 && (
        <div style={{ color: C.faint, fontSize: 13, marginTop: 20 }}>Nothing posted yet.</div>
      )}

      <div style={{ display: 'grid', gap: 14, marginTop: 16 }}>
        {(posts ?? []).map((p) => (
          <PostCard
            key={p.id}
            theme={theme}
            post={p}
            onReply={(text, dev) => run(api.replyToDevBlogPost(p.id, text, dev))}
            onDelete={() => run(api.deleteDevBlogPost(p.id))}
            onTogglePin={() => run(api.updateDevBlogPost(p.id, { pinned: !p.pinned }))}
            onDeleteReply={(id) => run(api.deleteDevBlogReply(id))}
          />
        ))}
      </div>
    </div>
  );
}

function PostCard({
  theme,
  post,
  onReply,
  onDelete,
  onTogglePin,
  onDeleteReply,
}: {
  theme: Theme;
  post: DevBlogPost;
  onReply: (body: string, asDevelopment: boolean) => void;
  onDelete: () => void;
  onTogglePin: () => void;
  onDeleteReply: (id: string) => void;
}) {
  const [replying, setReplying] = useState(false);
  const [text, setText] = useState('');
  const [asDev, setAsDev] = useState(false);

  return (
    <section style={{ ...panel(theme), ...(post.pinned ? { borderLeft: `2px solid ${C.gold}` } : null) }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 11 }}>
        <Byline kind={post.authorKind} name={post.authorName} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: C.text }}>{post.title}</span>
            {post.pinned && <Icon name="star" size={13} color={C.gold} />}
          </div>
          <div style={{ fontSize: 11, color: C.faint, fontFamily: C.mono, marginTop: 3 }}>
            {post.authorName} · {stamp(post.createdAt)}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, flex: 'none' }}>
          <button onClick={onTogglePin} style={iconBtn} title={post.pinned ? 'Unpin' : 'Pin'}>
            <Icon name="star" size={13} color={post.pinned ? C.gold : C.faint} />
          </button>
          <button onClick={onDelete} style={iconBtn} title="Delete">
            <Icon name="trash-2" size={13} color={C.faint} />
          </button>
        </div>
      </div>

      <div
        style={{
          fontSize: 13,
          color: C.muted,
          lineHeight: 1.65,
          whiteSpace: 'pre-wrap',
          marginTop: 11,
        }}
      >
        {post.body}
      </div>

      {post.replies.length > 0 && (
        <div style={{ display: 'grid', gap: 10, marginTop: 14, paddingLeft: 14, borderLeft: `1px solid ${C.line2}` }}>
          {post.replies.map((r) => (
            <div key={r.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <Byline kind={r.authorKind} name={r.authorName} size={22} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 11, color: C.faint, fontFamily: C.mono }}>
                  {r.authorName} · {stamp(r.createdAt)}
                </div>
                <div style={{ fontSize: 12.5, color: C.muted, lineHeight: 1.6, whiteSpace: 'pre-wrap', marginTop: 2 }}>
                  {r.body}
                </div>
              </div>
              <button onClick={() => onDeleteReply(r.id)} style={iconBtn} title="Delete reply">
                <Icon name="trash-2" size={12} color={C.faint} />
              </button>
            </div>
          ))}
        </div>
      )}

      {replying ? (
        <div style={{ marginTop: 12 }}>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Reply"
            rows={3}
            style={{ ...input, resize: 'vertical', fontFamily: 'inherit' }}
          />
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              marginTop: 8,
              fontSize: 12,
              color: C.muted,
              cursor: 'pointer',
            }}
          >
            <input type="checkbox" checked={asDev} onChange={(e) => setAsDev(e.target.checked)} />
            {"Reply as VTS Development"}
          </label>
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button
              onClick={() => {
                onReply(text, asDev);
                setText('');
                setAsDev(false);
                setReplying(false);
              }}
              disabled={!text.trim()}
              style={{ ...primaryBtn, opacity: text.trim() ? 1 : 0.55 }}
            >
              {"Reply"}
            </button>
            <button onClick={() => setReplying(false)} style={ghostBtn}>
              {"Cancel"}
            </button>
          </div>
        </div>
      ) : (
        <button onClick={() => setReplying(true)} style={{ ...ghostBtn, marginTop: 12 }}>
          {"Reply"}
        </button>
      )}
    </section>
  );
}

// The author mark. VTS Development gets the brand avatar; a person gets their
// initial, since the blog is a small founder-only board where a name is enough.
function Byline({ kind, name, size = 30 }: { kind: string; name: string; size?: number }) {
  if (kind === 'vts_development') {
    return (
      <img
        src={DEV_AVATAR}
        alt=""
        width={size}
        height={size}
        style={{ flex: 'none', borderRadius: 6, display: 'block' }}
      />
    );
  }
  return (
    <span
      aria-hidden
      style={{
        flex: 'none',
        width: size,
        height: size,
        borderRadius: 6,
        background: 'rgba(255,255,255,.06)',
        border: `1px solid ${C.line2}`,
        display: 'grid',
        placeItems: 'center',
        fontSize: size * 0.42,
        fontWeight: 700,
        color: C.muted,
      }}
    >
      {name.trim().charAt(0).toUpperCase()}
    </span>
  );
}

function stamp(ms: number): string {
  return new Date(ms).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

const input: CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  fontSize: 13,
  color: '#eef3ff',
  background: 'rgba(6,15,36,.6)',
  border: '1px solid #1d3560',
  borderRadius: 8,
  outline: 'none',
};

const primaryBtn: CSSProperties = {
  border: 'none',
  background: `linear-gradient(180deg,${C.gold},#C9A24B)`,
  color: '#0c2768',
  fontWeight: 700,
  fontSize: 12.5,
  padding: '9px 15px',
  borderRadius: 8,
  cursor: 'pointer',
  fontFamily: 'inherit',
};

const ghostBtn: CSSProperties = {
  fontSize: 12.5,
  fontWeight: 600,
  color: '#dfe7fa',
  background: 'rgba(255,255,255,.05)',
  border: `1px solid ${C.line2}`,
  padding: '9px 14px',
  borderRadius: 8,
  cursor: 'pointer',
  fontFamily: 'inherit',
};

const iconBtn: CSSProperties = {
  background: 'none',
  border: 'none',
  padding: 4,
  cursor: 'pointer',
  lineHeight: 1,
};

const errorBox: CSSProperties = {
  marginBottom: 14,
  fontSize: 12.5,
  color: '#ffb4ab',
  background: 'rgba(239,84,104,.1)',
  border: '1px solid rgba(239,84,104,.4)',
  borderRadius: 8,
  padding: '9px 12px',
};
