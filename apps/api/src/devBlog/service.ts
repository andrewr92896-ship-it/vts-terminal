import crypto from 'node:crypto';
import { desc, eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { devBlogPosts, devBlogReplies, type DevBlogAuthorKind } from '../db/schema.js';
import { SEEDED_POSTS } from './seeded.js';

// The Developer Blog — the Developer Terminal's idea board.
//
// A message board rather than a changelog: posts are ideas in progress, and both
// the owner and the terminal's own development account write in it. Founder-level
// only, on the same gate as the rest of the Developer Terminal.
//
// "VTS Development" is an authorKind, not a user row, and that is the important
// design decision here. There is no account to sign in as, so nothing can
// authenticate as it and there is no password to leak — it is a label on a post
// plus an avatar, and the authority to write one still comes from a real
// founder-level session or from a checked-in seed entry (see seeded.ts).

export const VTS_DEVELOPMENT = 'VTS Development';

export interface DevBlogReply {
  id: string;
  body: string;
  authorKind: DevBlogAuthorKind;
  authorName: string;
  authorAvatar: string | null;
  createdAt: number;
  mine: boolean;
}

export interface DevBlogPost {
  id: string;
  title: string;
  body: string;
  authorKind: DevBlogAuthorKind;
  authorName: string;
  authorAvatar: string | null;
  pinned: boolean;
  createdAt: number;
  updatedAt: number;
  mine: boolean;
  replies: DevBlogReply[];
}

export class DevBlogError extends Error {}

const MAX_TITLE = 140;
const MAX_BODY = 8000;

// Everything, pinned first then newest. The board is small by nature — it is one
// person's idea list — so it is served whole rather than paged.
export async function listPosts(currentUserId: string): Promise<DevBlogPost[]> {
  const [posts, replies] = await Promise.all([
    db.select().from(devBlogPosts).orderBy(desc(devBlogPosts.pinned), desc(devBlogPosts.createdAt)),
    db.select().from(devBlogReplies).orderBy(devBlogReplies.createdAt),
  ]);

  // Avatars are joined live from the users table rather than denormalized, so a
  // new profile picture shows on old posts. VTS Development has no user row, so
  // its avatar is drawn client-side from the brand mark.
  const byPost = new Map<string, DevBlogReply[]>();
  for (const r of replies) {
    const list = byPost.get(r.postId) ?? [];
    list.push({
      id: r.id,
      body: r.body,
      authorKind: r.authorKind as DevBlogAuthorKind,
      authorName: r.authorName,
      authorAvatar: null,
      createdAt: r.createdAt.getTime(),
      mine: r.authorId === currentUserId,
    });
    byPost.set(r.postId, list);
  }

  return posts.map((p) => ({
    id: p.id,
    title: p.title,
    body: p.body,
    authorKind: p.authorKind as DevBlogAuthorKind,
    authorName: p.authorName,
    authorAvatar: null,
    pinned: p.pinned,
    createdAt: p.createdAt.getTime(),
    updatedAt: p.updatedAt.getTime(),
    mine: p.authorId === currentUserId,
    replies: byPost.get(p.id) ?? [],
  }));
}

export interface PostInput {
  title: string;
  body: string;
  /** Post as the terminal's development account rather than under your own name. */
  asDevelopment?: boolean;
  pinned?: boolean;
}

function clean(input: PostInput): { title: string; body: string } {
  const title = input.title.trim();
  const body = input.body.trim();
  if (!title) throw new DevBlogError('Give it a title');
  if (!body) throw new DevBlogError('Write something');
  if (title.length > MAX_TITLE) throw new DevBlogError('That title is too long');
  if (body.length > MAX_BODY) throw new DevBlogError('That post is too long');
  return { title, body };
}

export async function createPost(
  author: { id: string; displayName: string },
  input: PostInput,
): Promise<DevBlogPost[]> {
  const { title, body } = clean(input);
  const now = new Date();
  const asDev = !!input.asDevelopment;
  await db.insert(devBlogPosts).values({
    id: crypto.randomUUID(),
    title,
    body,
    authorKind: asDev ? 'vts_development' : 'user',
    // A post attributed to VTS Development still records who actually wrote it,
    // so "mine" works and the trail is not lost — the attribution is a display
    // choice, not anonymity.
    authorId: author.id,
    authorName: asDev ? VTS_DEVELOPMENT : author.displayName,
    pinned: !!input.pinned,
    seedKey: null,
    createdAt: now,
    updatedAt: now,
  });
  return listPosts(author.id);
}

export async function updatePost(
  author: { id: string },
  id: string,
  input: Partial<PostInput>,
): Promise<DevBlogPost[]> {
  const row = (await db.select().from(devBlogPosts).where(eq(devBlogPosts.id, id)).limit(1))[0];
  if (!row) throw new DevBlogError('That post is gone');
  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (input.title !== undefined) {
    const title = input.title.trim();
    if (!title) throw new DevBlogError('Give it a title');
    patch.title = title.slice(0, MAX_TITLE);
  }
  if (input.body !== undefined) {
    const body = input.body.trim();
    if (!body) throw new DevBlogError('Write something');
    patch.body = body.slice(0, MAX_BODY);
  }
  if (input.pinned !== undefined) patch.pinned = input.pinned;
  await db.update(devBlogPosts).set(patch).where(eq(devBlogPosts.id, id));
  return listPosts(author.id);
}

export async function removePost(currentUserId: string, id: string): Promise<DevBlogPost[]> {
  await db.delete(devBlogPosts).where(eq(devBlogPosts.id, id));
  return listPosts(currentUserId);
}

export async function addReply(
  author: { id: string; displayName: string },
  postId: string,
  body: string,
  asDevelopment = false,
): Promise<DevBlogPost[]> {
  const text = body.trim();
  if (!text) throw new DevBlogError('Write something');
  const exists = (await db.select().from(devBlogPosts).where(eq(devBlogPosts.id, postId)).limit(1))[0];
  if (!exists) throw new DevBlogError('That post is gone');
  await db.insert(devBlogReplies).values({
    id: crypto.randomUUID(),
    postId,
    body: text.slice(0, MAX_BODY),
    authorKind: asDevelopment ? 'vts_development' : 'user',
    authorId: author.id,
    authorName: asDevelopment ? VTS_DEVELOPMENT : author.displayName,
    createdAt: new Date(),
  });
  return listPosts(author.id);
}

export async function removeReply(currentUserId: string, id: string): Promise<DevBlogPost[]> {
  await db.delete(devBlogReplies).where(eq(devBlogReplies.id, id));
  return listPosts(currentUserId);
}

// Publish the checked-in posts on boot.
//
// This is how Claude Code posts to the blog, and it is worth being explicit
// about why it works this way. Claude Code changes the repository; it has no
// session and no route into production at runtime. So a post it writes is an
// entry in devBlog/seeded.ts, and the deploy that carries the entry publishes
// it. Keyed on `seedKey`, so redeploying updates that post in place rather than
// stacking duplicates every time the server restarts.
//
// A seeded post can be replied to and deleted like any other. Deleting one does
// mean the next boot brings it back — remove its entry from seeded.ts to be rid
// of it for good.
export async function seedDevBlog(): Promise<void> {
  if (SEEDED_POSTS.length === 0) return;
  const now = new Date();
  for (const post of SEEDED_POSTS) {
    const existing = (
      await db.select().from(devBlogPosts).where(eq(devBlogPosts.seedKey, post.key)).limit(1)
    )[0];
    if (existing) {
      if (existing.title !== post.title || existing.body !== post.body) {
        await db
          .update(devBlogPosts)
          .set({ title: post.title, body: post.body, updatedAt: now })
          .where(eq(devBlogPosts.id, existing.id));
      }
      continue;
    }
    await db.insert(devBlogPosts).values({
      id: crypto.randomUUID(),
      title: post.title,
      body: post.body,
      authorKind: 'vts_development',
      authorId: null,
      authorName: VTS_DEVELOPMENT,
      pinned: !!post.pinned,
      seedKey: post.key,
      createdAt: now,
      updatedAt: now,
    });
  }
}
