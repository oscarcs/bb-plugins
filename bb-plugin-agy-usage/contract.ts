import {defineRpcContract} from '@get-bb/plugin-sdk';
import {z} from 'zod';
const base = {plan:z.null(), accountEmail:z.string().nullable(), planLabel:z.string().nullable()};
export const usage = z.discriminatedUnion('status', [
  z.object({status:z.literal('ok'), ...base, windows:z.array(z.object({kind:z.enum(['weekly','five-hour','custom']),id:z.string().min(1),label:z.string().min(1),usedPercent:z.number().min(0).max(100),resetsAt:z.string().nullable(),model:z.string(),cost:z.null()}))}),
  z.object({status:z.literal('error'), ...base, message:z.string()})
]);
export const reading = z.object({accountKey:z.null(),observedAt:z.number().nullable(),usage});
export const hostContract = defineRpcContract({read:{input:z.object({refresh:z.boolean()}),output:reading}});
export const LIST = 'provider-usage.v1.listResources';
export const GET = 'provider-usage.v1.getResource';
export const sourceContract = defineRpcContract({
  [LIST]:{input:z.object({}),output:z.object({resources:z.array(z.object({accountKey:z.null(),id:z.string(),providerId:z.string(),label:z.string(),scope:z.object({kind:z.literal('host'),hostId:z.string(),hostName:z.string()})}))})},
  [GET]:{input:z.object({resourceId:z.string().min(1),refresh:z.boolean()}),output:reading}
});
