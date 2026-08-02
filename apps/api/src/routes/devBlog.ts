import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { requireFounder } from '../auth/middleware.js';
import {
  DevBlogError,
  addReply,
  createPost,
  listPosts,
  removePost,
  removeReply,
  updatePost,
} from '../devBlog/service.js';

// The Developer Blog, at /api/dev-blog/*. Founder-level throughout — reads
// included, since the board is the developers' own working notes rather than
// anything an admin needs.

const postSchema = z.object({
  title: z.string().trim().min(1).max(140),
  body: z.string().trim().min(1).max(8000),
  asDevelopment: z.boolean().optional(),
  pinned: z.boolean().optional(),
});

const patchSchema = postSchema.partial().refine(
  (v) => v.title !== undefined || v.body !== undefined || v.pinned !== undefined,
  { message: 'Nothing to change' },
);

const replySchema = z.object({
  body: z.string().trim().min(1).max(8000),
  asDevelopment: z.boolean().optional(),
});

function fail(err: unknown): string {
  return err instanceof DevBlogError ? err.message : 'Something went wrong';
}

export async function devBlogRoutes(app: FastifyInstance): Promise<void> {
  const guard = { preHandler: requireFounder };

  app.get('/api/dev-blog', guard, async (request) => ({
    posts: await listPosts(request.currentUser!.id),
  }));

  app.post('/api/dev-blog', guard, async (request, reply) => {
    const parsed = postSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Give it a title and a body' });
    const u = request.currentUser!;
    try {
      return { posts: await createPost({ id: u.id, displayName: u.displayName }, parsed.data) };
    } catch (err) {
      return reply.code(400).send({ error: fail(err) });
    }
  });

  app.patch('/api/dev-blog/:id', guard, async (request, reply) => {
    const id = (request.params as { id: string }).id;
    const parsed = patchSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Nothing to change' });
    try {
      return { posts: await updatePost({ id: request.currentUser!.id }, id, parsed.data) };
    } catch (err) {
      return reply.code(400).send({ error: fail(err) });
    }
  });

  app.delete('/api/dev-blog/:id', guard, async (request) => ({
    posts: await removePost(request.currentUser!.id, (request.params as { id: string }).id),
  }));

  app.post('/api/dev-blog/:id/replies', guard, async (request, reply) => {
    const id = (request.params as { id: string }).id;
    const parsed = replySchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Write something' });
    const u = request.currentUser!;
    try {
      return {
        posts: await addReply(
          { id: u.id, displayName: u.displayName },
          id,
          parsed.data.body,
          parsed.data.asDevelopment,
        ),
      };
    } catch (err) {
      return reply.code(400).send({ error: fail(err) });
    }
  });

  app.delete('/api/dev-blog/replies/:id', guard, async (request) => ({
    posts: await removeReply(request.currentUser!.id, (request.params as { id: string }).id),
  }));
}
