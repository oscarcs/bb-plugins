import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseUsageScreen} from '../parser.js';
const panel = `Models & Quota
Account: person@example.test
GEMINI MODELS
Models within this group: Gemini Flash, Gemini Pro
Weekly Limit Remaining
[████] 100.00%
Quota available
Five Hour Limit Remaining
[██░░] 42.50%
Refreshes in 2h 15m
CLAUDE AND GPT MODELS
Weekly Limit Remaining
[████] 100.00%
Quota available
Five Hour Limit Remaining
[████] 100.00%
Quota available
GEMINI 4 ARGON
Gemini 4 Argon Weekly Limit
[███░] 98.01%
Refreshes in 6d 23h 48m
↑/↓ Scroll · esc Close`;
test('converts all five remaining balances to consumed percentages and countdowns', () => {
 const now=Date.parse('2026-10-20T00:00:00Z');
 const result=parseUsageScreen(panel,now);
 assert.equal(result.accountEmail,'person@example.test');
 assert.deepEqual(result.windows.map(w=>w.usedPercent),[0,57.5,0,0,1.99]);
 assert.equal(result.windows[0].resetsAt,null);
 assert.equal(result.windows[1].kind,'five-hour');
 assert.equal(result.windows[1].resetsAt,'2026-10-20T02:15:00.000Z');
 assert.equal(result.windows[4].resetsAt,'2026-10-26T23:48:00.000Z');
});
test('rejects partial panels, redraws, changed units and invalid percentages',()=>{
 for(const value of [panel.slice(0,panel.indexOf('GEMINI 4 ARGON')),panel.replace('42.50%','unknown'),panel.replace('42.50%','142.50%'),panel.replace('2h 15m','2 weeks'),panel.replace('Quota available','Loading…'),panel.replace('Models & Quota','Sign in')]) assert.throws(()=>parseUsageScreen(value));
});
test('stable IDs are independent of percentage and countdown changes',()=>{
 assert.deepEqual(parseUsageScreen(panel).windows.map(w=>w.id),parseUsageScreen(panel.replace('98.01%','75.00%').replace('6d 23h 48m','1h 2m')).windows.map(w=>w.id));
});
