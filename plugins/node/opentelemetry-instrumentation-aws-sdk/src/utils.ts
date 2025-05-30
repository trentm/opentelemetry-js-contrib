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
import { Attributes, Context, context } from '@opentelemetry/api';
import {
  SEMATTRS_RPC_METHOD,
  SEMATTRS_RPC_SERVICE,
  SEMATTRS_RPC_SYSTEM,
} from '@opentelemetry/semantic-conventions';
import { AttributeNames } from './enums';
import { NormalizedRequest } from './types';

export const removeSuffixFromStringIfExists = (
  str: string,
  suffixToRemove: string
): string => {
  const suffixLength = suffixToRemove.length;
  return str?.slice(-suffixLength) === suffixToRemove
    ? str.slice(0, str.length - suffixLength)
    : str;
};

export const normalizeV3Request = (
  serviceName: string,
  commandNameWithSuffix: string,
  commandInput: Record<string, any>,
  region: string | undefined
): NormalizedRequest => {
  return {
    serviceName: serviceName?.replace(/\s+/g, ''),
    commandName: removeSuffixFromStringIfExists(
      commandNameWithSuffix,
      'Command'
    ),
    commandInput,
    region,
  };
};

export const extractAttributesFromNormalizedRequest = (
  normalizedRequest: NormalizedRequest
): Attributes => {
  return {
    [SEMATTRS_RPC_SYSTEM]: 'aws-api',
    [SEMATTRS_RPC_METHOD]: normalizedRequest.commandName,
    [SEMATTRS_RPC_SERVICE]: normalizedRequest.serviceName,
    [AttributeNames.CLOUD_REGION]: normalizedRequest.region,
  };
};

export const bindPromise = <T = unknown>(
  target: Promise<T>,
  contextForCallbacks: Context,
  rebindCount = 1
): Promise<T> => {
  const origThen = target.then;
  type PromiseThenParameters = Parameters<Promise<T>['then']>;
  target.then = function <TResult1 = T, TResult2 = never>(
    onFulfilled: PromiseThenParameters[0],
    onRejected: PromiseThenParameters[1]
  ): Promise<TResult1 | TResult2> {
    const newOnFulfilled = context.bind(contextForCallbacks, onFulfilled);
    const newOnRejected = context.bind(contextForCallbacks, onRejected);
    const patchedPromise = origThen.call<
      Promise<T>,
      any[],
      Promise<TResult1 | TResult2>
    >(this, newOnFulfilled, newOnRejected);
    return rebindCount > 1
      ? bindPromise(patchedPromise, contextForCallbacks, rebindCount - 1)
      : patchedPromise;
  };
  return target;
};
