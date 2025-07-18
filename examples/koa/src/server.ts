/*
 * Copyright The OpenTelemetry Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import * as api from '@opentelemetry/api';

// Adding Koa router (if desired)
import * as Router from '@koa/router';
import * as Koa from 'koa';
import { setupTracing } from './tracer';

setupTracing('example-koa-server');

// Setup koa
const app = new Koa();
const PORT = 8081;
const router = new Router();

// route definitions
router
  .get('/run_test', runTest)
  .get('/post/new', addPost)
  .get('/post/:id', showNewPost);

async function setUp() {
  app.use(noOp);
  app.use(router.routes());
}

/**
 *  Router functions: list, add, or show posts
 */
const posts = ['post 0', 'post 1', 'post 2'];

function addPost(ctx: Koa.Context) {
  const newPostId = posts.length;
  posts.push(`post ${newPostId}`);
  const currentSpan = api.trace.getSpan(api.context.active());
  currentSpan?.addEvent('Added post');
  currentSpan?.setAttribute('post.id', newPostId);
  ctx.body = `Added post: ${posts[posts.length - 1]}`;
  ctx.redirect('/post/3');
}

async function showNewPost(ctx: Koa.Context) {
  const { id } = ctx.params;
  console.log(`showNewPost with id: ${id}`);
  const post = posts[id];
  if (!post) ctx.throw(404, 'Invalid post id');
  const syntheticDelay = 500;
  await new Promise(r => {
    setTimeout(r, syntheticDelay);
  });
  ctx.body = post;
}

function runTest(ctx: Koa.Context) {
  console.log('runTest');
  const currentSpan = api.trace.getSpan(api.context.active());
  if (currentSpan) {
    const { traceId } = currentSpan.spanContext();
    console.log(`traceid: ${traceId}`);
    console.log(`Jaeger URL: http://localhost:16686/trace/${traceId}`);
    console.log(`Zipkin URL: http://localhost:9411/zipkin/traces/${traceId}`);
    ctx.body = `All posts: ${posts}`;
    ctx.redirect('/post/new');
  }
}

function noOp(ctx: Koa.Context, next: Koa.Next) {
  console.log('Sample basic koa middleware');
  const syntheticDelay = 100;
  setTimeout(next, syntheticDelay);
}

setUp()
  .then(() => {
    app.listen(PORT);
    console.log(`Listening on http://localhost:${PORT}`);
  })
  .catch(err => console.log(err));
