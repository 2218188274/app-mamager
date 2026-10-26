const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

// Executes the real component handlers with controlled bridge promises. Native
// geometry and accessibility are checked separately by Android instrumentation.
exports.deferred = () => { let resolve, reject; const promise = new Promise((a,b) => { resolve=a; reject=b; }); return {promise,resolve,reject}; };
exports.mount = function(file, name, dependencies = {}, props = {}) {
  const slots=[], effects=[], timers=new Map(), events=new Map(), alerts=[];
  let cursor=0, tree, nextTimer=0, mounted=true;
  const React = {
    createElement:(type,props,...children)=>({type,props:{...props,children:children.flat(Infinity)}}), Fragment:'Fragment',
    useState(initial){const i=cursor++;if(!(i in slots))slots[i]=typeof initial==='function'?initial():initial;return [slots[i],value=>{slots[i]=typeof value==='function'?value(slots[i]):value;}];},
    useRef(initial){const i=cursor++;return slots[i]||(slots[i]={current:initial});},
    useEffect(fn,deps){const i=cursor++,old=slots[i];if(!old||!deps||deps.some((d,j)=>d!==old.deps[j])){slots[i]={deps,cleanup:old?.cleanup};effects.push(()=>{slots[i].cleanup?.();slots[i].cleanup=fn();});}},
  };
  const native={Keyboard:{dismiss(){}},Alert:{alert:(...args)=>alerts.push(args)},AppState:{addEventListener:(name,fn)=>{events.set(name,fn);return {remove:()=>events.delete(name)};}},BackHandler:{addEventListener:(name,fn)=>{events.set(name,fn);return {remove:()=>events.delete(name)};}},StyleSheet:{create:x=>x},Linking:{openURL:async()=>{}}};
  for(const k of ['View','Text','TextInput','Pressable','Switch','ActivityIndicator','ScrollView','Modal','Image'])native[k]=k;
  native.useWindowDimensions=()=>({width:320,height:640,fontScale:1});
  native.Platform={OS:'android'};
  Object.assign(native,dependencies['react-native']);
  const exported={};
  const source=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React}}).outputText;
  vm.runInNewContext(source,{exports:exported,require:id=>id==='react'?{...React,default:React}:id==='react-native'?native:id in dependencies?dependencies[id]:id==='../design'?{ui:{},colors:{}}:id==='./Ui'?{Action:'Action',PageIntro:'PageIntro',CopyAction:'CopyAction',EmptyState:'EmptyState'}:id==='../services/nativeError'?{displayError:(e,f)=>e.message||f}:id==='../../package.json'?require('../package.json'):(()=>{throw Error('Unmocked '+id)})(),setTimeout:fn=>{timers.set(++nextTimer,fn);return nextTimer;},clearTimeout:id=>timers.delete(id),setInterval:fn=>{timers.set(++nextTimer,fn);return nextTimer;},clearInterval:id=>timers.delete(id),console,Error,Date,JSON,Promise,AbortController});
  const render=()=>{if(mounted){cursor=0;tree=exported[name](props);while(effects.length)effects.shift()();}return tree;};
  const nodes=()=>{const result=[];function walk(n){if(!n||typeof n!=='object')return;result.push(n);for(const c of n.props?.children||[])walk(c);}walk(tree);return result;};
  const api={render,nodes,alerts,async settle(){for(let i=0;i<12;i++){await Promise.resolve();render();}},find(label){return nodes().find(n=>n.props.accessibilityLabel===label||n.props.label===label);},text(){return nodes().flatMap(n=>n.props.children).filter(x=>typeof x==='string'||typeof x==='number').join(' ');},async press(label){const n=api.find(label);if(!n)throw Error('Missing '+label);if(n.props.disabled)throw Error('Disabled '+label);await n.props.onPress();await api.settle();},event:(name,value)=>events.get(name)?.(value),tick(){const tasks=[...timers.values()];timers.clear();tasks.forEach(fn=>fn());},unmount(){mounted=false;for(const s of slots)s?.cleanup?.();}};
  render();return api;
};
