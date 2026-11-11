const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const exported={};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(require.resolve('../src/design.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports:exported,require:()=>({StyleSheet:{create:x=>x}})});
function luminance(hex){const c=hex.slice(1).match(/../g).map(v=>parseInt(v,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return c[0]*.2126+c[1]*.7152+c[2]*.0722;}
function contrast(a,b){const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);}
test('shared palette keeps readable text, primary press states and identifiable input boundaries',()=>{
 const c=exported.colors;
 for(const background of [c.surface,c.background,c.raised,c.soft])for(const role of ['ink','secondary','muted'])assert.ok(contrast(c[role],background)>=4.5,role+' on '+background);
 for(const color of [c.primary,c.primaryPressed])assert.ok(contrast(c.surface,color)>=4.5,'primary text while pressed');
 assert.ok(contrast(c.primary,c.soft)>=4.5,'selected label');
 assert.ok(contrast(c.inputBorder,c.surface)>=3,'field boundary');
 for(const [text,bg] of [[c.danger,c.dangerSoft],[c.success,c.successSoft]])assert.ok(contrast(text,bg)>=4.5,'semantic text');
});

test('custom reply actions keep visible pressed and disabled feedback',()=>{
 const {mount}=require('./component-harness.cjs');
 const deps={'@react-native-clipboard/clipboard':{}};
 const file=require.resolve('../src/components/Ui.tsx');
 function background(props,pressed){const h=mount(file,'Action',deps,{label:'test',onPress(){},...props});const value=Object.assign({},...h.find('test').props.style({pressed}));h.unmount();return value.backgroundColor;}
 const custom={secondary:true,style:{backgroundColor:'custom-surface'}};
 assert.notEqual(background(custom,false),background(custom,true));
 assert.equal(background({...custom,disabled:true},true),background({secondary:true,disabled:true},false));
});
