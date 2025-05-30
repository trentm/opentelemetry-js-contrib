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

import {
  INVALID_SPAN_CONTEXT,
  SpanKind,
  context,
  trace,
} from '@opentelemetry/api';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';
import {
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import * as assert from 'assert';

import { KnexInstrumentation } from '../src';
const plugin = new KnexInstrumentation({
  maxQueryLength: 50,
});

import knex from 'knex';

describe('Knex instrumentation', () => {
  const memoryExporter = new InMemorySpanExporter();
  const spanProcessor = new SimpleSpanProcessor(memoryExporter);
  const provider = new NodeTracerProvider({
    spanProcessors: [spanProcessor],
  });
  plugin.setTracerProvider(provider);
  const tracer = provider.getTracer('default');
  let contextManager: AsyncLocalStorageContextManager;
  let client: any;

  before(() => {
    plugin.enable();
  });

  after(() => {
    plugin.disable();
  });

  beforeEach(async () => {
    contextManager = new AsyncLocalStorageContextManager();
    context.setGlobalContextManager(contextManager.enable());

    client = knex({
      client: 'sqlite3',
      connection: {
        filename: ':memory:',
      },
      useNullAsDefault: true,
    });

    assert.strictEqual(memoryExporter.getFinishedSpans().length, 0);
  });

  afterEach(() => {
    memoryExporter.reset();
    context.disable();
    client.schema.dropTableIfExists('testTable');
    client.schema.dropTableIfExists('testTable1');
    client.schema.dropTableIfExists('testTable2');
    client.destroy();
  });

  describe('Instrumenting', () => {
    it('should record spans from query builder', async () => {
      const parentSpan = tracer.startSpan('parentSpan');
      await context.with(
        trace.setSpan(context.active(), parentSpan),
        async () => {
          await client.schema.createTable('testTable1', (table: any) => {
            table.string('title');
          });
          await client.insert({ title: 'test1' }).into('testTable1');

          assert.deepEqual(await client('testTable1').select('*'), [
            { title: 'test1' },
          ]);

          parentSpan.end();

          const instrumentationSpans = memoryExporter.getFinishedSpans();
          const last = instrumentationSpans.pop() as any;
          assertSpans(instrumentationSpans, [
            {
              statement: 'create table `testTable1` (`title` varchar(255))',
              parentSpan,
            },
            {
              op: 'insert',
              table: 'testTable1',
              statement: 'insert into `testTable1` (`title`) values (?)',
              parentSpan,
            },
            {
              op: 'select',
              table: 'testTable1',
              statement: 'select * from `testTable1`',
              parentSpan,
            },
          ]);
          assert.strictEqual(instrumentationSpans[0].name, ':memory:');
          assert.strictEqual(
            instrumentationSpans[1].name,
            'insert :memory:.testTable1'
          );

          assert(last.name, 'parentSpan');
        }
      );
    });

    it('should collect spans from raw', async () => {
      const parentSpan = tracer.startSpan('parentSpan');
      const statement = "select date('now')";

      await context.with(
        trace.setSpan(context.active(), parentSpan),
        async () => {
          await client.raw(statement);
          parentSpan.end();

          assertSpans(memoryExporter.getFinishedSpans(), [
            { statement, op: 'raw', parentSpan },
            null,
          ]);
        }
      );
    });

    it('should truncate the query', async () => {
      const statement = `select date('now'), "${'long-'.repeat(15)}"`;
      await client.raw(statement);

      const [span] = memoryExporter.getFinishedSpans();
      const limitedStatement = span?.attributes?.['db.statement'] as string;
      assert.strictEqual(limitedStatement.length, 52);
      assert.ok(statement.startsWith(limitedStatement.substring(0, 50)));
    });

    it('should catch errors', async () => {
      const parentSpan = tracer.startSpan('parentSpan');
      const neverError = new Error('Query was expected to error');
      const MESSAGE = 'SQLITE_ERROR: no such table: testTable1';
      const CODE = 'SQLITE_ERROR';

      await context.with(
        trace.setSpan(context.active(), parentSpan),
        async () => {
          await client
            .insert({ title: 'test1' })
            .into('testTable1')
            .then(() => {
              throw neverError;
            })
            .catch((err: any) => {
              assertMatch(err.message, /SQLITE_ERROR/, err);
            });
          parentSpan.end();

          const events = memoryExporter.getFinishedSpans()[0].events!;

          assert.strictEqual(events.length, 1);
          assert.strictEqual(events[0].name, 'exception');
          assert.strictEqual(
            events[0].attributes?.['exception.message'],
            MESSAGE
          );
          assert.strictEqual(events[0].attributes?.['exception.type'], CODE);

          assertSpans(memoryExporter.getFinishedSpans(), [
            {
              op: 'insert',
              table: 'testTable1',
              statement: 'insert into `testTable1` (`title`) values (?)',
              parentSpan,
            },
            null,
          ]);
        }
      );
    });

    it('should catch better-sqlite3 errors', async () => {
      client = knex({
        client: 'better-sqlite3',
        connection: {
          filename: ':memory:',
        },
        useNullAsDefault: true,
      });

      const parentSpan = tracer.startSpan('parentSpan');
      const MESSAGE = 'no such table: testTable1';
      const CODE = 'SQLITE_ERROR';

      await context.with(
        trace.setSpan(context.active(), parentSpan),
        async () => {
          try {
            await client
              .insert({ title: 'test1' })
              .into('testTable1')
              .catch((err: any) => {
                assertMatch(err.message, /SQLITE_ERROR/, err);
              });
          } catch (e) {
            // skip
          }
          parentSpan.end();

          const events = memoryExporter.getFinishedSpans()[0].events!;

          assert.strictEqual(events.length, 1);
          assert.strictEqual(events[0].name, 'exception');
          assert.strictEqual(
            events[0].attributes?.['exception.message'],
            MESSAGE
          );
          assert.strictEqual(events[0].attributes?.['exception.type'], CODE);

          assertSpans(
            memoryExporter.getFinishedSpans(),
            [
              {
                op: 'insert',
                table: 'testTable1',
                statement: 'insert into `testTable1` (`title`) values (?)',
                parentSpan,
              },
              null,
            ],
            { dbSystem: 'better-sqlite3' }
          );
        }
      );
    });

    describe('nested queries', () => {
      it('should correctly identify the table in nested queries', async () => {
        const parentSpan = tracer.startSpan('parentSpan');
        await context.with(
          trace.setSpan(context.active(), parentSpan),
          async () => {
            await client.schema.createTable('testTable1', (table: any) => {
              table.string('title');
            });
            await client.insert({ title: 'test1' }).into('testTable1');

            const builder = client('testTable1').select('*');
            const clone = builder.clone().clear('order');

            const nestedQueryBuilder = builder.client
              .queryBuilder()
              .count('* AS count')
              .from(clone.as('inner'))
              .first();

            const total = await nestedQueryBuilder;
            assert.deepEqual(total, { count: 1 });

            parentSpan.end();

            const instrumentationSpans = memoryExporter.getFinishedSpans();
            assertSpans(instrumentationSpans, [
              {
                statement: 'create table `testTable1` (`title` varchar(255))',
                parentSpan,
              },
              {
                op: 'insert',
                table: 'testTable1',
                statement: 'insert into `testTable1` (`title`) values (?)',
                parentSpan,
              },
              {
                op: 'first',
                table: 'testTable1',
                statement:
                  'select count(*) as `count` from (select * from `te..',
                parentSpan,
              },
              null,
            ]);
          }
        );
      });

      it('should correctly identify the table in double nested queries', async () => {
        const parentSpan = tracer.startSpan('parentSpan');
        await context.with(
          trace.setSpan(context.active(), parentSpan),
          async () => {
            await client.schema.createTable('testTable1', (table: any) => {
              table.string('title');
            });
            await client.insert({ title: 'test1' }).into('testTable1');

            const builder = client('testTable1').select('*');
            const clone = builder.clone().clear('order');

            const nestedQueryBuilder = builder.client
              .queryBuilder()
              .count('* AS count')
              .from(clone.as('inner'))
              .first();

            const nestedClone = nestedQueryBuilder.clone().clear('order');
            const totalDoubleNested = await nestedQueryBuilder.client
              .queryBuilder()
              .count('* AS count2')
              .from(nestedClone.as('inner2'))
              .first();
            assert.deepEqual(totalDoubleNested, { count2: 1 });

            parentSpan.end();

            const instrumentationSpans = memoryExporter.getFinishedSpans();
            assertSpans(instrumentationSpans, [
              {
                statement: 'create table `testTable1` (`title` varchar(255))',
                parentSpan,
              },
              {
                op: 'insert',
                table: 'testTable1',
                statement: 'insert into `testTable1` (`title`) values (?)',
                parentSpan,
              },
              {
                op: 'first',
                table: 'testTable1',
                statement:
                  'select count(*) as `count2` from (select count(*) ..',
                parentSpan,
              },
              null,
            ]);
          }
        );
      });

      it('should correctly identify the table in join with nested table', async () => {
        const parentSpan = tracer.startSpan('parentSpan');
        await context.with(
          trace.setSpan(context.active(), parentSpan),
          async () => {
            await client.schema.createTable('testTable1', (table: any) => {
              table.string('title');
            });
            await client.insert({ title: 'test1' }).into('testTable1');

            await client.schema.createTable('testTable2', (table: any) => {
              table.string('title');
            });
            await client.insert({ title: 'test2' }).into('testTable2');

            const builder = client('testTable1').select('*');
            const clone = builder.clone().clear('order');

            const nestedQueryBuilder = builder.client
              .queryBuilder()
              .count('* AS count')
              .from(clone.as('inner'))
              .first();

            const totalDoubleNested = await nestedQueryBuilder.client
              .queryBuilder()
              .from('testTable2')
              .leftJoin(nestedQueryBuilder.as('nested_query'))
              .first();
            assert.deepEqual(totalDoubleNested, { title: 'test2', count: 1 });

            parentSpan.end();

            const instrumentationSpans = memoryExporter.getFinishedSpans();
            assertSpans(instrumentationSpans, [
              {
                statement: 'create table `testTable1` (`title` varchar(255))',
                parentSpan,
              },
              {
                op: 'insert',
                table: 'testTable1',
                statement: 'insert into `testTable1` (`title`) values (?)',
                parentSpan,
              },
              {
                statement: 'create table `testTable2` (`title` varchar(255))',
                parentSpan,
              },
              {
                op: 'insert',
                table: 'testTable2',
                statement: 'insert into `testTable2` (`title`) values (?)',
                parentSpan,
              },
              {
                op: 'first',
                table: 'testTable2',
                statement:
                  'select * from `testTable2` left join (select count..',
                parentSpan,
              },
              null,
            ]);
          }
        );
      });

      it('should correctly identify the table in join nested table with table', async () => {
        const parentSpan = tracer.startSpan('parentSpan');
        await context.with(
          trace.setSpan(context.active(), parentSpan),
          async () => {
            await client.schema.createTable('testTable1', (table: any) => {
              table.string('title');
            });
            await client.insert({ title: 'test1' }).into('testTable1');

            await client.schema.createTable('testTable2', (table: any) => {
              table.string('title');
            });
            await client.insert({ title: 'test2' }).into('testTable2');

            const builder = client('testTable1').select('*');
            const clone = builder.clone().clear('order');

            const nestedQueryBuilder = builder.client
              .queryBuilder()
              .count('* AS count')
              .from(clone.as('inner'))
              .first();

            const totalDoubleNested = await nestedQueryBuilder.client
              .queryBuilder()
              .from(nestedQueryBuilder.as('nested_query'))
              .leftJoin('testTable2')
              .first();
            assert.deepEqual(totalDoubleNested, { title: 'test2', count: 1 });

            parentSpan.end();

            const instrumentationSpans = memoryExporter.getFinishedSpans();
            assertSpans(instrumentationSpans, [
              {
                statement: 'create table `testTable1` (`title` varchar(255))',
                parentSpan,
              },
              {
                op: 'insert',
                table: 'testTable1',
                statement: 'insert into `testTable1` (`title`) values (?)',
                parentSpan,
              },
              {
                statement: 'create table `testTable2` (`title` varchar(255))',
                parentSpan,
              },
              {
                op: 'insert',
                table: 'testTable2',
                statement: 'insert into `testTable2` (`title`) values (?)',
                parentSpan,
              },
              {
                op: 'first',
                table: 'testTable1',
                statement:
                  'select * from (select count(*) as `count` from (se..',
                parentSpan,
              },
              null,
            ]);
          }
        );
      });
    });
  });

  describe('Disabling instrumentation', () => {
    it('should not create new spans', async () => {
      plugin.disable();
      const parentSpan = tracer.startSpan('parentSpan');

      await context.with(
        trace.setSpan(context.active(), parentSpan),
        async () => {
          await client.raw("select date('now')");
          parentSpan.end();
          assert.strictEqual(memoryExporter.getFinishedSpans().length, 1);
          assert.notStrictEqual(
            memoryExporter.getFinishedSpans()[0],
            undefined
          );
        }
      );
    });
  });

  describe('Setting requireParentSpan=true', () => {
    beforeEach(() => {
      plugin.disable();
      plugin.setConfig({ requireParentSpan: true });
      plugin.enable();
    });

    it('should not create new spans when there is no parent', async () => {
      await client.schema.createTable('testTable1', (table: any) => {
        table.string('title');
      });
      assert.deepEqual(await client('testTable1').select('*'), []);
      assert.deepEqual(await client.raw('select 1 as result'), [{ result: 1 }]);
      assert.strictEqual(memoryExporter.getFinishedSpans().length, 0);
    });

    it('should not create new spans when there is an INVALID_SPAN_CONTEXT parent', async () => {
      const parentSpan = trace.wrapSpanContext(INVALID_SPAN_CONTEXT);
      await context.with(
        trace.setSpan(context.active(), parentSpan),
        async () => {
          await client.schema.createTable('testTable1', (table: any) => {
            table.string('title');
          });
          assert.deepEqual(await client('testTable1').select('*'), []);
          assert.deepEqual(await client.raw('select 1 as result'), [
            { result: 1 },
          ]);
        }
      );
      assert.strictEqual(memoryExporter.getFinishedSpans().length, 0);
    });

    it('should create new spans when there is a parent', async () => {
      await tracer.startActiveSpan('parentSpan', async parentSpan => {
        await client.schema.createTable('testTable1', (table: any) => {
          table.string('title');
        });
        assert.deepEqual(await client('testTable1').select('*'), []);
        assert.deepEqual(await client.raw('select 1 as result'), [
          { result: 1 },
        ]);
        parentSpan.end();
      });
      assert.strictEqual(memoryExporter.getFinishedSpans().length, 4);
      const instrumentationSpans = memoryExporter.getFinishedSpans();
      const last = instrumentationSpans.pop() as any;
      assertSpans(instrumentationSpans, [
        {
          statement: 'create table `testTable1` (`title` varchar(255))',
          parentSpan: last,
        },
        {
          op: 'select',
          table: 'testTable1',
          statement: 'select * from `testTable1`',
          parentSpan: last,
        },
        {
          op: 'raw',
          statement: 'select 1 as result',
          parentSpan: last,
        },
      ]);
    });
  });
});

const assertSpans = (
  actualSpans: any[],
  expectedSpans: any[],
  options?: { dbSystem?: string }
) => {
  const customAssertOptions = {
    dbSystem: 'sqlite',
    ...options,
  };
  assert(Array.isArray(actualSpans), 'Expected `actualSpans` to be an array');
  assert(
    Array.isArray(expectedSpans),
    'Expected `expectedSpans` to be an array'
  );
  assert.strictEqual(
    actualSpans.length,
    expectedSpans.length,
    'Expected span count different from actual'
  );
  actualSpans.forEach((span, idx) => {
    const expected = expectedSpans[idx];
    if (expected === null) return;
    try {
      assert.notStrictEqual(span, undefined);
      assert.notStrictEqual(expected, undefined);
      assert.strictEqual(span.kind, SpanKind.CLIENT);
      assertMatch(span.name, new RegExp(expected.op));
      assertMatch(span.name, new RegExp(':memory:'));
      assert.strictEqual(
        span.attributes['db.system'],
        customAssertOptions.dbSystem
      );
      assert.strictEqual(span.attributes['db.name'], ':memory:');
      assert.strictEqual(span.attributes['db.sql.table'], expected.table);
      assert.strictEqual(span.attributes['db.statement'], expected.statement);
      assert.strictEqual(
        typeof span.attributes['knex.version'],
        'string',
        'knex.version not specified'
      );
      assert.strictEqual(span.attributes['db.operation'], expected.op);
      assert.strictEqual(
        span.parentSpanContext?.spanId,
        expected.parentSpan?.spanContext().spanId
      );
    } catch (e: any) {
      e.message = `At span[${idx}]: ${e.message}`;
      throw e;
    }
  });
};

const assertMatch = (str: string, regexp: RegExp, err?: any) => {
  assert.ok(regexp.test(str), err ?? `Expected '${str} to match ${regexp}`);
};
