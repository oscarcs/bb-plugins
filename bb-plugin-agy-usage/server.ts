import type {BbPluginApi} from '@get-bb/plugin-sdk';
import {hostContract,sourceContract,LIST,GET} from './contract.js';
export default function plugin(bb: BbPluginApi) {
  const host = bb.hosts.experimental_client({contract:hostContract});
  bb.rpc.register(sourceContract, {
    [LIST]:async () => ({resources:(await bb.sdk.hosts.list()).filter(h => h.status==='connected' && h.type!=='ephemeral').map(h => ({accountKey:null,id:h.id,providerId:'acp-antigravity',label:'Antigravity',scope:{kind:'host' as const,hostId:h.id,hostName:h.name}}))}),
    [GET]:async ({resourceId,refresh}) => {
      const hosts = await bb.sdk.hosts.list();
      if (!hosts.some(h => h.id===resourceId && h.status==='connected' && h.type!=='ephemeral')) throw new Error('Usage host is no longer connected.');
      const reading = await host.call('read',{refresh},{hostId:resourceId,timeoutMs:35_000});
      if (reading.usage.status !== 'ok') return reading;
      return {...reading, usage:{...reading.usage, windows:reading.usage.windows.map(window =>
        // BB expands typed five-hour windows to “Five-hour limit · model”.
        // A custom display label keeps the model visible in the narrow panel.
        window.kind === 'five-hour'
          ? {...window, kind:'custom' as const, label:`5h · ${window.model}`}
          : window
      )}};
    }
  },{experimental_discoverable:true,experimental_description:'Antigravity quotas collected from the official agy /usage screen.'});
}
