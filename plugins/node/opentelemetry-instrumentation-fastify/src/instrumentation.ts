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

import { context, Attributes, SpanStatusCode, trace } from '@opentelemetry/api';
import { getRPCMetadata, RPCType } from '@opentelemetry/core';
import {
  InstrumentationBase,
  InstrumentationNodeModuleDefinition,
  safeExecuteInTheMiddle,
} from '@opentelemetry/instrumentation';
import { ATTR_HTTP_ROUTE } from '@opentelemetry/semantic-conventions';
import type {
  HookHandlerDoneFunction,
  FastifyInstance,
  FastifyRequest,
  FastifyReply,
  FastifyErrorCodes,
} from 'fastify';
import { hooksNamesToWrap } from './constants';
import {
  AttributeNames,
  FastifyNames,
  FastifyTypes,
} from './enums/AttributeNames';
import type { HandlerOriginal, PluginFastifyReply } from './internal-types';
import type { FastifyInstrumentationConfig } from './types';
import {
  endSpan,
  safeExecuteInTheMiddleMaybePromise,
  startSpan,
} from './utils';
/** @knipignore */
import { PACKAGE_NAME, PACKAGE_VERSION } from './version';

export const ANONYMOUS_NAME = 'anonymous';

/**
 * Fastify instrumentation for OpenTelemetry
 * @deprecated This instrumentation is deprecated in favor of the official instrumentation package `@fastify/otel`,
 *             which is maintained by the fastify authors.
 */
export class FastifyInstrumentation extends InstrumentationBase<FastifyInstrumentationConfig> {
  constructor(config: FastifyInstrumentationConfig = {}) {
    super(PACKAGE_NAME, PACKAGE_VERSION, config);
  }

  init() {
    return [
      new InstrumentationNodeModuleDefinition(
        'fastify',
        ['>=3.0.0 <6'],
        moduleExports => {
          return this._patchConstructor(moduleExports);
        }
      ),
    ];
  }

  private _hookOnRequest() {
    const instrumentation = this;
    return function onRequest(
      request: FastifyRequest,
      reply: FastifyReply,
      done: HookHandlerDoneFunction
    ) {
      if (!instrumentation.isEnabled()) {
        return done();
      }
      instrumentation._wrap(reply, 'send', instrumentation._patchSend());

      const anyRequest = request as any;

      const rpcMetadata = getRPCMetadata(context.active());
      const routeName = anyRequest.routeOptions
        ? anyRequest.routeOptions.url // since fastify@4.10.0
        : request.routerPath;
      if (routeName && rpcMetadata?.type === RPCType.HTTP) {
        rpcMetadata.route = routeName;
      }
      done();
    };
  }

  private _wrapHandler(
    pluginName: string,
    hookName: string,
    original: (...args: unknown[]) => Promise<unknown>,
    syncFunctionWithDone: boolean
  ): () => Promise<unknown> {
    const instrumentation = this;
    this._diag.debug('Patching fastify route.handler function');

    return function (this: any, ...args: unknown[]): Promise<unknown> {
      if (!instrumentation.isEnabled()) {
        return original.apply(this, args);
      }

      const name = original.name || pluginName || ANONYMOUS_NAME;
      const spanName = `${FastifyNames.MIDDLEWARE} - ${name}`;

      const reply = args[1] as PluginFastifyReply;

      const span = startSpan(reply, instrumentation.tracer, spanName, {
        [AttributeNames.FASTIFY_TYPE]: FastifyTypes.MIDDLEWARE,
        [AttributeNames.PLUGIN_NAME]: pluginName,
        [AttributeNames.HOOK_NAME]: hookName,
      });

      const origDone =
        syncFunctionWithDone &&
        (args[args.length - 1] as HookHandlerDoneFunction);
      if (origDone) {
        args[args.length - 1] = function (
          ...doneArgs: Parameters<HookHandlerDoneFunction>
        ) {
          endSpan(reply);
          origDone.apply(this, doneArgs);
        };
      }

      return context.with(trace.setSpan(context.active(), span), () => {
        return safeExecuteInTheMiddleMaybePromise(
          () => {
            return original.apply(this, args);
          },
          err => {
            if (err instanceof Error) {
              span.setStatus({
                code: SpanStatusCode.ERROR,
                message: err.message,
              });
              span.recordException(err);
            }
            // async hooks should end the span as soon as the promise is resolved
            if (!syncFunctionWithDone) {
              endSpan(reply);
            }
          }
        );
      });
    };
  }

  private _wrapAddHook(): (
    original: FastifyInstance['addHook']
  ) => () => FastifyInstance {
    const instrumentation = this;
    this._diag.debug('Patching fastify server.addHook function');

    return function (
      original: FastifyInstance['addHook']
    ): () => FastifyInstance {
      return function wrappedAddHook(this: any, ...args: any) {
        const name = args[0] as string;
        const handler = args[1] as HandlerOriginal;
        const pluginName = this.pluginName;
        if (!hooksNamesToWrap.has(name)) {
          return original.apply(this, args);
        }

        const syncFunctionWithDone =
          typeof args[args.length - 1] === 'function' &&
          handler.constructor.name !== 'AsyncFunction';

        return original.apply(this, [
          name,
          instrumentation._wrapHandler(
            pluginName,
            name,
            handler,
            syncFunctionWithDone
          ),
        ] as never);
      };
    };
  }

  private _patchConstructor(moduleExports: {
    fastify: () => FastifyInstance;
    errorCodes: FastifyErrorCodes | undefined;
  }): () => FastifyInstance {
    const instrumentation = this;

    function fastify(this: FastifyInstance, ...args: any) {
      const app: FastifyInstance = moduleExports.fastify.apply(this, args);
      app.addHook('onRequest', instrumentation._hookOnRequest());
      app.addHook('preHandler', instrumentation._hookPreHandler());

      instrumentation._wrap(app, 'addHook', instrumentation._wrapAddHook());

      return app;
    }

    if (moduleExports.errorCodes !== undefined) {
      fastify.errorCodes = moduleExports.errorCodes;
    }
    fastify.fastify = fastify;
    fastify.default = fastify;
    return fastify;
  }

  private _patchSend() {
    const instrumentation = this;
    this._diag.debug('Patching fastify reply.send function');

    return function patchSend(
      original: () => FastifyReply
    ): () => FastifyReply {
      return function send(this: FastifyReply, ...args: any) {
        const maybeError: any = args[0];

        if (!instrumentation.isEnabled()) {
          return original.apply(this, args);
        }

        return safeExecuteInTheMiddle<FastifyReply>(
          () => {
            return original.apply(this, args);
          },
          err => {
            if (!err && maybeError instanceof Error) {
              err = maybeError;
            }
            endSpan(this, err);
          }
        );
      };
    };
  }

  private _hookPreHandler() {
    const instrumentation = this;
    this._diag.debug('Patching fastify preHandler function');

    return function preHandler(
      this: any,
      request: FastifyRequest,
      reply: FastifyReply,
      done: HookHandlerDoneFunction
    ) {
      if (!instrumentation.isEnabled()) {
        return done();
      }
      const anyRequest = request as any;

      const handler =
        anyRequest.routeOptions?.handler || anyRequest.context?.handler;

      const handlerName = handler?.name.startsWith('bound ')
        ? handler.name.substring(6)
        : handler?.name;
      const spanName = `${FastifyNames.REQUEST_HANDLER} - ${
        handlerName || this.pluginName || ANONYMOUS_NAME
      }`;

      const spanAttributes: Attributes = {
        [AttributeNames.PLUGIN_NAME]: this.pluginName,
        [AttributeNames.FASTIFY_TYPE]: FastifyTypes.REQUEST_HANDLER,
        [ATTR_HTTP_ROUTE]: anyRequest.routeOptions
          ? anyRequest.routeOptions.url // since fastify@4.10.0
          : request.routerPath,
      };
      if (handlerName) {
        spanAttributes[AttributeNames.FASTIFY_NAME] = handlerName;
      }
      const span = startSpan(
        reply,
        instrumentation.tracer,
        spanName,
        spanAttributes
      );

      const { requestHook } = instrumentation.getConfig();
      if (requestHook) {
        safeExecuteInTheMiddle(
          () => requestHook(span, { request }),
          e => {
            if (e) {
              instrumentation._diag.error('request hook failed', e);
            }
          },
          true
        );
      }

      return context.with(trace.setSpan(context.active(), span), () => {
        done();
      });
    };
  }
}
