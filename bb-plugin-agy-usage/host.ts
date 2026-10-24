import {experimental_defineHostEntry} from '@get-bb/plugin-sdk';
import {mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {hostContract, type reading} from './contract.js';
import {collectUsage} from './collector.js';
import type {z} from 'zod';
type Reading = z.infer<typeof reading>;
let cached: Reading | undefined;
let pending: Promise<Reading> | undefined;
export default experimental_defineHostEntry({
  contract:hostContract,
  handlers:{read:async ({refresh}, context) => {
    if (pending) return pending;
    if (!refresh && cached?.observedAt && Date.now()-cached.observedAt < 120_000) return cached;
    pending = (async (): Promise<Reading> => {
      try {
        const cwd = join(context.experimental_paths.dataDir, 'usage-workspace');
        await mkdir(cwd, {recursive:true,mode:0o700});
        const usage = await collectUsage(cwd, AbortSignal.any([context.signal, context.lifecycle.signal]));
        cached = {accountKey:null, observedAt:Date.now(),usage};
        return cached;
      } catch (error) {
        return {accountKey:null,observedAt:cached?.observedAt ?? null,usage:{status:'error',plan:null,accountEmail:null,planLabel:null,message:error instanceof Error ? error.message : 'Unable to read agy /usage.'}};
      }
    })().finally(() => {pending=undefined;});
    return pending;
  }}
});
