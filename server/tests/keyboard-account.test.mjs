import {test} from 'node:test';import assert from 'node:assert/strict';import {quotaSnapshot} from '../dist/services/ai/keyboard-account.js';
test('free quota follows successful generations and UTC day boundary',()=>{
 const q=quotaSnapshot({enableAI:true,freeReplyLimitPerDay:20,freeCandidateCount:2},7,undefined,new Date('2026-10-22T23:59:59Z'));
 assert.equal(q.remaining,13);assert.equal(q.candidateLimit,2);assert.equal(q.resetsAt,'2026-10-23T00:00:00.000Z');assert.equal(q.isPro,false);
 assert.equal(quotaSnapshot({freeReplyLimitPerDay:0},1,undefined).remaining,0);
});
test('only active non-expired paid subscriptions remove daily cap',()=>{
 const settings={freeReplyLimitPerDay:5,proCandidateCount:3};const now=new Date('2026-10-22T00:00:00Z');
 for(const status of ['cancelled','expired','grace_period']) assert.equal(quotaSnapshot(settings,5,{tier:'pro_monthly',status,expiresAt:null},now).remaining,0);
 assert.equal(quotaSnapshot(settings,8,{tier:'pro_monthly',status:'active',expiresAt:new Date('2026-10-21')},now).isPro,false);
 const pro=quotaSnapshot(settings,8,{tier:'pro_monthly',status:'active',expiresAt:null},now);assert.equal(pro.limit,null);assert.equal(pro.remaining,null);assert.equal(pro.candidateLimit,3);
 assert.equal(quotaSnapshot(settings,1,{tier:'free',status:'active',expiresAt:null},now).isPro,false);
});
test('candidate limits use the same clamp and defaults as generation',()=>{
 assert.equal(quotaSnapshot({freeCandidateCount:99},0,undefined).candidateLimit,5);
 assert.equal(quotaSnapshot({freeCandidateCount:0},0,undefined).candidateLimit,1);
 assert.equal(quotaSnapshot(null,0,undefined).limit,10);
});
