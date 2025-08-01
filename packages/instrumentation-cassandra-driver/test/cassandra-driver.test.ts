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
  InMemorySpanExporter,
  SimpleSpanProcessor,
  ReadableSpan,
} from '@opentelemetry/sdk-trace-base';
import {
  Attributes,
  context,
  Span,
  SpanKind,
  SpanStatus,
  SpanStatusCode,
} from '@opentelemetry/api';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';
import {
  DBSYSTEMVALUES_CASSANDRA,
  SEMATTRS_DB_STATEMENT,
  SEMATTRS_DB_SYSTEM,
  SEMATTRS_DB_USER,
  SEMATTRS_EXCEPTION_MESSAGE,
  SEMATTRS_EXCEPTION_STACKTRACE,
  SEMATTRS_EXCEPTION_TYPE,
  SEMATTRS_NET_PEER_NAME,
  SEMATTRS_NET_PEER_PORT,
} from '@opentelemetry/semantic-conventions';
import * as assert from 'assert';
import * as testUtils from '@opentelemetry/contrib-test-utils';
import type * as CassandraDriver from 'cassandra-driver';
import {
  CassandraDriverInstrumentation,
  CassandraDriverInstrumentationConfig,
} from '../src';
import { ResponseHookInfo } from '../src/types';

const memoryExporter = new InMemorySpanExporter();
const provider = new NodeTracerProvider({
  spanProcessors: [new SimpleSpanProcessor(memoryExporter)],
});
context.setGlobalContextManager(new AsyncLocalStorageContextManager());

const testCassandra = process.env.RUN_CASSANDRA_TESTS;
const shouldTest = testCassandra;
const cassandraContactPoint = process.env.CASSANDRA_HOST
  ? '127.0.0.1'
  : 'cassandra';

function assertSpan(
  span: ReadableSpan,
  name: string,
  query?: string,
  status?: SpanStatus,
  customAttributes?: Attributes
) {
  const attributes: Attributes = {
    [SEMATTRS_DB_SYSTEM]: DBSYSTEMVALUES_CASSANDRA,
    [SEMATTRS_DB_USER]: 'cassandra',
    ...customAttributes,
  };

  if (query !== undefined) {
    attributes[SEMATTRS_DB_STATEMENT] = query;
  }

  const spanStatus =
    status === undefined ? { code: SpanStatusCode.UNSET } : status;
  testUtils.assertSpan(span, SpanKind.CLIENT, attributes, [], spanStatus);
}

function assertSingleSpan(
  name: string,
  query?: string,
  status?: SpanStatus,
  customAttributes?: Attributes
) {
  const spans = memoryExporter.getFinishedSpans();
  assert.strictEqual(spans.length, 1);
  const [span] = spans;
  assertSpan(span, name, query, status, customAttributes);
}

function assertAttributeInSingleSpan(name: string, attributes?: Attributes) {
  const spans = memoryExporter.getFinishedSpans();
  assert.strictEqual(spans.length, 1);
  const [span] = spans;
  assertSpan(span, name, undefined, undefined, attributes);
}

function assertErrorSpan(
  name: string,
  error: Error & { code?: number },
  query?: string,
  customAttributes?: Attributes
) {
  const spans = memoryExporter.getFinishedSpans();
  assert.strictEqual(spans.length, 1);
  const [span] = spans;

  const attributes: Attributes = {
    [SEMATTRS_DB_SYSTEM]: DBSYSTEMVALUES_CASSANDRA,
    [SEMATTRS_DB_USER]: 'cassandra',
    ...customAttributes,
  };

  if (query !== undefined) {
    attributes[SEMATTRS_DB_STATEMENT] = query;
  }

  const events = [
    {
      name: 'exception',
      droppedAttributesCount: 0,
      attributes: {
        [SEMATTRS_EXCEPTION_STACKTRACE]: error.stack,
        [SEMATTRS_EXCEPTION_MESSAGE]: error.message,
        [SEMATTRS_EXCEPTION_TYPE]: String(error.code),
      },
      time: span.events[0].time,
    },
  ];

  const status = {
    code: SpanStatusCode.ERROR,
    message: error.message,
  };

  testUtils.assertSpan(span, SpanKind.CLIENT, attributes, events, status);
}

describe('CassandraDriverInstrumentation', () => {
  let client: CassandraDriver.Client;
  let instrumentation: CassandraDriverInstrumentation;

  before(async function () {
    if (!shouldTest) {
      this.skip();
    }

    instrumentation = new CassandraDriverInstrumentation();
    instrumentation.setTracerProvider(provider);

    const cassandra = require('cassandra-driver');
    client = new cassandra.Client({
      contactPoints: [cassandraContactPoint],
      localDataCenter: 'datacenter1',
      credentials: {
        username: 'cassandra',
        password: 'cassandra',
      },
    });

    // Since Cassandra boots up for a while, the connects might timeout, hence the retries.
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        await client.connect();
        break;
      } catch (e) {}
    }

    await client.execute(
      "CREATE KEYSPACE IF NOT EXISTS ot WITH REPLICATION = { 'class': 'SimpleStrategy', 'replication_factor': '1' }"
    );
    await client.execute(
      'CREATE TABLE IF NOT EXISTS ot.test (userid TEXT PRIMARY KEY, count int)'
    );
  });

  after(async function () {
    await client?.shutdown?.();
  });

  describe('execute', () => {
    beforeEach(() => {
      memoryExporter.reset();
    });

    it('creates a span for promise based execute', async () => {
      await client.execute('select * from ot.test');
      assertSingleSpan('cassandra-driver.execute', undefined, undefined, {
        [SEMATTRS_NET_PEER_NAME]: cassandraContactPoint,
        [SEMATTRS_NET_PEER_PORT]: 9042,
      });
    });

    it('creates a span for callback based execute', done => {
      client.execute('select * from ot.test', () => {
        assertSingleSpan('cassandra-driver.execute', undefined, undefined, {
          [SEMATTRS_NET_PEER_NAME]: cassandraContactPoint,
          [SEMATTRS_NET_PEER_PORT]: 9042,
        });
        done();
      });
    });

    it('creates an error span', async () => {
      try {
        await client.execute('selec * from');
      } catch (e: any) {
        assertErrorSpan('cassandra-driver.execute', e, undefined, {
          [SEMATTRS_NET_PEER_NAME]: cassandraContactPoint,
          [SEMATTRS_NET_PEER_PORT]: 9042,
        });
        return;
      }

      assert.fail();
    });

    describe('statements', () => {
      before(() => {
        const config: CassandraDriverInstrumentationConfig = {
          maxQueryLength: 25,
          enhancedDatabaseReporting: true,
        };
        instrumentation.setConfig(config);
      });

      after(() => {
        const config: CassandraDriverInstrumentationConfig = {
          maxQueryLength: 65536,
          enhancedDatabaseReporting: false,
        };
        instrumentation.setConfig(config);
      });

      it('retains statements', async () => {
        const query = 'select * from ot.test';
        await client.execute(query);
        assertSingleSpan('cassandra-driver.execute', query, undefined, {
          [SEMATTRS_NET_PEER_NAME]: cassandraContactPoint,
          [SEMATTRS_NET_PEER_PORT]: 9042,
        });
      });

      it('truncates long queries', async () => {
        const query = 'select userid, count from ot.test';
        await client.execute(query);
        const customAttributes = {
          [SEMATTRS_NET_PEER_NAME]: cassandraContactPoint,
          [SEMATTRS_NET_PEER_PORT]: 9042,
        };
        assertSingleSpan(
          'cassandra-driver.execute',
          query.substring(0, 25),
          undefined,
          customAttributes
        );
        assertSingleSpan(
          'cassandra-driver.execute',
          query.substring(0, 25),
          undefined,
          customAttributes
        );
      });
    });

    describe('responseHook', () => {
      after(() => {
        instrumentation.setConfig({});
      });

      it('adds custom attributes to span', async () => {
        const responseAttributeName = 'response.attribute';
        const customAttributeName = 'custom.attribute';
        const customAttributeValue = 'custom attribute value';

        const config: CassandraDriverInstrumentationConfig = {
          responseHook: (span: Span, responseInfo: ResponseHookInfo) => {
            const row = responseInfo.response.rows[0];
            const responseValue = row.count.toNumber();

            span.setAttribute(responseAttributeName, responseValue);
            span.setAttribute(customAttributeName, customAttributeValue);
          },
        };

        instrumentation.setConfig(config);

        await client.execute(
          "SELECT count(*) FROM system_schema.columns WHERE keyspace_name = 'ot' AND table_name = 'test';"
        );

        assertAttributeInSingleSpan('cassandra-driver.execute', {
          [customAttributeName]: customAttributeValue,
          [responseAttributeName]: 2,
          [SEMATTRS_NET_PEER_NAME]: cassandraContactPoint,
          [SEMATTRS_NET_PEER_PORT]: 9042,
        });
      });

      it('throws and should not affect user flow or span creation', async () => {
        const hookAttributeName = 'hook.attribute';
        const hookAttributeValue = 'hook attribute value';

        const config: CassandraDriverInstrumentationConfig = {
          responseHook: (span: Span, responseInfo: ResponseHookInfo): void => {
            span.setAttribute(hookAttributeName, hookAttributeValue);
            throw new Error('error inside hook');
          },
        };

        instrumentation.setConfig(config);

        const query = 'select * from ot.test';
        await client.execute(query);

        assertAttributeInSingleSpan('cassandra-driver.execute', {
          [hookAttributeName]: hookAttributeValue,
          [SEMATTRS_NET_PEER_NAME]: cassandraContactPoint,
          [SEMATTRS_NET_PEER_PORT]: 9042,
        });
      });
    });
  });

  describe('batch', () => {
    beforeEach(() => {
      memoryExporter.reset();
    });

    const q1 = "insert into ot.test (userid, count) values ('1234', 42)";
    const q2 = "insert into ot.test (userid, count) values ('3421', 10)";
    const combined = `${q1}\n${q2}`;

    it('creates a span for promise based batch', async () => {
      await client.batch([q1, q2]);
      assertSingleSpan('cassandra-driver.batch');
    });

    it('creates a span for callback based batch', done => {
      client.batch([q1, q2], () => {
        assertSingleSpan('cassandra-driver.batch', undefined, undefined, {
          [SEMATTRS_NET_PEER_NAME]: cassandraContactPoint,
          [SEMATTRS_NET_PEER_PORT]: 9042,
        });
        done();
      });
    });

    it('creates an error span', async () => {
      const query = 'insert into foobar';
      try {
        await client.batch([query]);
      } catch (e: any) {
        assertErrorSpan('cassandra-driver.batch', e);
        return;
      }

      assert.fail();
    });

    describe('statements', () => {
      before(() => {
        const config: CassandraDriverInstrumentationConfig = {
          enhancedDatabaseReporting: true,
        };
        instrumentation.setConfig(config);
      });

      after(() => {
        const config: CassandraDriverInstrumentationConfig = {
          enhancedDatabaseReporting: false,
        };
        instrumentation.setConfig(config);
      });

      it('attaches combined statement', async () => {
        await client.batch([q1, q2]);
        assertSingleSpan('cassandra-driver.batch', combined);
      });
    });
  });

  describe('stream', () => {
    beforeEach(() => {
      memoryExporter.reset();
    });

    const query = 'select * from ot.test';

    function assertStreamSpans() {
      const spans = memoryExporter.getFinishedSpans();
      // stream internally uses execute
      assert.strictEqual(spans.length, 2);
      assertSpan(spans[0], 'cassandra-driver.execute', undefined, undefined, {
        [SEMATTRS_NET_PEER_NAME]: cassandraContactPoint,
        [SEMATTRS_NET_PEER_PORT]: 9042,
      });
      assertSpan(spans[1], 'cassandra-driver.stream');
    }

    it('creates a span for a stream call', done => {
      const emitter = client.stream(query);
      emitter.on('readable', function (this: any) {
        while (this.read()) {}
      });
      emitter.on('error', e => assert.fail(e));
      emitter.on('end', () => {
        assertStreamSpans();
        done();
      });
    });

    it('creates a span for stream call with a callback', done => {
      client.stream(query, undefined, undefined, () => {
        assertStreamSpans();
        done();
      });
    });
  });
});
