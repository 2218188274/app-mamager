import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createServer} from 'node:http';
import {CloudLexicon,toDigits} from '../dist/services/input/lexicon.js';
import {InputLimits} from '../dist/services/input/limits.js';
import {validateWav,transcribeWav} from '../dist/services/input/speech.js';

function wav(samples=16000,level=1200) {
  const out=Buffer.alloc(44+samples*2);out.write('RIFF');out.writeUInt32LE(out.length-8,4);out.write('WAVEfmt ',8);out.writeUInt32LE(16,16);out.writeUInt16LE(1,20);out.writeUInt16LE(1,22);out.writeUInt32LE(16000,24);out.writeUInt32LE(32000,28);out.writeUInt16LE(2,32);out.writeUInt16LE(16,34);out.write('data',36);out.writeUInt32LE(samples*2,40);
  for(let i=0;i<samples;i++)out.writeInt16LE(i%2?level:-level,44+i*2);return out;
}
test('real cloud data resolves full pinyin and nine digits with bounded candidates',()=>{
  const dictionary=new CloudLexicon(readFileSync('data/input/cloud-lexicon.tsv','utf8'));
  assert.ok(dictionary.entries>140000);assert.equal(toDigits('nihao'),'64426');
  assert.ok(dictionary.lookup('yunciku','qwerty').some(x=>x.text==='云词库'));
  assert.ok(dictionary.lookup(toDigits('yunciku'),'nine').some(x=>x.text==='云词库'));
  assert.ok(dictionary.lookup('nihao','qwerty').some(x=>x.text==='你好'));
  assert.ok(dictionary.lookup('64426','nine').length<=12);assert.deepEqual(dictionary.lookup('no-such-code','qwerty'),[]);
});
test('input limits isolate users/apps and reset at minute/day boundaries',()=>{
  const limits=new InputLimits();for(let i=0;i<6;i++)limits.check('a','u','speech',0);
  assert.throws(()=>limits.check('a','u','speech',0),{code:'TOO_MANY_REQUESTS'});
  limits.check('b','u','speech',0);limits.check('a','other','speech',0);limits.check('a','u','lookup',0);limits.check('a','u','speech',60000);
  for(let minute=2;minute<21;minute++)for(let n=0;n<6;n++){try{limits.check('a','u','speech',minute*60000);}catch(error){assert.equal(error.code,'TOO_MANY_REQUESTS');}}
  assert.throws(()=>limits.check('a','u','speech',22*60000),{code:'TOO_MANY_REQUESTS'});limits.check('a','u','speech',86400000);
});
test('WAV validation accepts app format and rejects silent oversized malformed audio',()=>{
  assert.equal(validateWav(wav().toString('base64')).durationMs,1000);
  for(const invalid of ['not-base64',wav(100).toString('base64'),wav(16000,0).toString('base64'),wav(320001).toString('base64')])assert.throws(()=>validateWav(invalid),{code:'BAD_REQUEST'});
  const stereo=wav();stereo.writeUInt16LE(2,22);assert.throws(()=>validateWav(stereo.toString('base64')),{code:'BAD_REQUEST'});
});
test('speech adapter uploads WAV with selected language, sanitizes failures and limits concurrency',async()=>{
  let mode='ok', calls=0, uploaded='', release;
  const server=createServer(async(req,res)=>{calls++;for await(const chunk of req)uploaded+=chunk.toString('latin1');if(mode==='wait')await new Promise(resolve=>{release=resolve;});if(mode==='error'){res.writeHead(500);res.end('secret internal details');return;}res.setHeader('Content-Type','application/json');res.end(JSON.stringify({text:mode==='empty'?'[silence]':'  你好，语音输入。  '}));});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const endpoint=`http://127.0.0.1:${server.address().port}/inference`, audio=wav().toString('base64');
  try{
    const result=await transcribeWav(audio,'zh',endpoint);assert.equal(result.text,'你好，语音输入。');assert.equal(result.durationMs,1000);assert.ok(uploaded.includes('audio/wav')&&uploaded.includes('RIFF')&&uploaded.includes('name="language"\r\n\r\nzh'));
    mode='error';await assert.rejects(transcribeWav(audio,'en',endpoint),{code:'BAD_GATEWAY',message:'语音识别暂不可用或超时，请稍后手动重试'});
    mode='empty';await assert.rejects(transcribeWav(audio,'en',endpoint),{code:'BAD_REQUEST'});
    mode='wait';const pending=transcribeWav(audio,'en',endpoint);while(!release)await new Promise(resolve=>setTimeout(resolve,10));await assert.rejects(transcribeWav(audio,'en',endpoint),{code:'TOO_MANY_REQUESTS'});release();await pending;
    assert.equal(calls,4);
  }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
