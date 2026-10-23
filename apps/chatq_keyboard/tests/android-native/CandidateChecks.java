package com.chatq.keyboardtests;

import android.content.Context;
import android.content.SharedPreferences;
import java.lang.reflect.*;
import java.util.*;
import org.json.*;

final class CandidateChecks {
  private static int checks;
  private static void expect(boolean value,String label){if(!value)throw new AssertionError(label);checks++;}
  private static String value(Object item,String method)throws Exception{return String.valueOf(item.getClass().getMethod(method).invoke(item));}
  private static boolean contains(List<?> list,String text,int consumed)throws Exception{for(Object item:list)if(text.equals(value(item,"getText"))&&(consumed<0||String.valueOf(consumed).equals(value(item,"getConsumed"))))return true;return false;}
  private static String digits(String code){StringBuilder result=new StringBuilder();String letters="abcdefghijklmnopqrstuvwxyz",numbers="22233344455566677778889999";for(char c:code.toCharArray())result.append(numbers.charAt(letters.indexOf(c)));return result.toString();}
  static int run(Context context,SharedPreferences prefs)throws Exception{
    checks=0;ClassLoader loader=context.getClassLoader();
    Class<?> type=loader.loadClass("expo.modules.chatqkeyboard.ChineseDictionary");Object companion=type.getField("Companion").get(null);
    Object dictionary=companion.getClass().getMethod("get",Context.class).invoke(companion,context);
    Method full=type.getMethod("fullPinyin",String.class,List.class),nine=type.getMethod("nine",String.class),predict=type.getMethod("predict",String.class);
    List<?> list=(List<?>)full.invoke(dictionary,"nihao",Collections.emptyList());expect(value(list.get(0),"getText").equals("你好"),"common full Pinyin phrase leads");
    list=(List<?>)full.invoke(dictionary,"wzdl",Collections.emptyList());expect(contains(list,"我知道了",4),"authored chat initials");
    expect(contains((List<?>)full.invoke(dictionary,"mwt",Collections.emptyList()),"没问题",3),"short common chat phrase");
    try(java.io.BufferedReader reader=new java.io.BufferedReader(new java.io.InputStreamReader(context.getAssets().open("chat-phrases.tsv"),"UTF-8"))){String line;while((line=reader.readLine())!=null){String[] cells=line.split("\t");StringBuilder initials=new StringBuilder();for(String syllable:cells[3].split(" "))initials.append(syllable.charAt(0));if(initials.length()>=2&&initials.length()<=8&&!contains((List<?>)full.invoke(dictionary,initials.toString(),Collections.emptyList()),cells[1],initials.length()))throw new AssertionError("missing authored initials: "+initials);}}expect(true,"all authored short phrases retain initials regardless of original dictionary frequency");
    expect(contains((List<?>)full.invoke(dictionary,"xi'an",Collections.emptyList()),"西安",5),"explicit syllable boundaries preserve exact words");
    expect(!contains((List<?>)full.invoke(dictionary,"n'ihao",Collections.emptyList()),"你好",-1),"invalid apostrophe boundary never fabricates exact phrase");
    list=(List<?>)nine.invoke(dictionary,digits("wozhidaole"));expect(value(list.get(0),"getText").equals("我知道了"),"nine-key common chat phrase leads");
    list=(List<?>)nine.invoke(dictionary,digits("nihaozhongguo"));expect(contains(list,"你好中国",13),"nine-key combines multiple offline words");
    expect(contains(list,"你好",5),"sentence still permits partial word selection");
    list=(List<?>)nine.invoke(dictionary,"64426");expect(value(list.get(0),"getReading").equals("ni hao"),"nine-key displays syllable reading");
    expect(((List<?>)nine.invoke(dictionary,"10")).isEmpty()&&((List<?>)nine.invoke(dictionary,String.join("",Collections.nCopies(40,"6")))).isEmpty(),"invalid and overlong codes stay bounded");
    Random random=new Random(150);for(int i=0;i<160;i++){StringBuilder code=new StringBuilder();for(int j=0;j<1+i%39;j++)code.append((char)('2'+random.nextInt(8)));list=(List<?>)nine.invoke(dictionary,code.toString());expect(list.size()<=128,"bounded result count");Set<String> seen=new HashSet<>();for(Object item:list){int used=Integer.parseInt(value(item,"getConsumed"));if(used<1||used>code.length()||!seen.add(value(item,"getText")+":"+used))throw new AssertionError("invalid candidate consumption/duplicate "+code);}}
    Field cache=type.getDeclaredField("nineCache");cache.setAccessible(true);expect(((Map<?,?>)cache.get(dictionary)).size()<=96,"nine-key LRU stays bounded");
    expect(((List<?>)predict.invoke(dictionary,"你好")).get(0).equals("呀"),"authored next-word association leads");
    expect(((List<?>)predict.invoke(dictionary,"辛苦")).get(0).equals("了")&&((List<?>)predict.invoke(dictionary,"未知辛苦")).contains("了"),"associations use recent selected suffix");
    expect(((List<?>)predict.invoke(dictionary,"")).isEmpty()&&((List<?>)predict.invoke(dictionary,"你好")).size()<=12,"predictions are bounded and require context");
    Class<?> lexType=loader.loadClass("expo.modules.chatqkeyboard.UserLexicon");Object lex=lexType.getConstructor(SharedPreferences.class).newInstance(prefs);Method add=lexType.getMethod("add",String.class,String.class,boolean.class);
    lexType.getMethod("clear").invoke(lex);add.invoke(lex,"nihao","你好同学",true);add.invoke(lex,"wo","我先走了",false);
    list=(List<?>)lexType.getMethod("rank",String.class,List.class,boolean.class).invoke(lex,"nihao'zhongguo",Collections.emptyList(),false);expect(contains(list,"你好同学",6),"manual prefix retains remaining Pinyin after separator");
    list=(List<?>)lexType.getMethod("rankNine",String.class,List.class,boolean.class).invoke(lex,"6442694664486",Collections.emptyList(),false);expect(contains(list,"你好同学",5),"manual nine-key prefix retains trailing digits");
    Method complete=lexType.getMethod("complete",String.class,boolean.class);expect(((List<?>)complete.invoke(lex,"你好",false)).contains("同学"),"manual phrase suffix works without learning");
    add.invoke(lex,"nihao","你好",false);list=(List<?>)lexType.getMethod("rankNine",String.class,List.class,boolean.class).invoke(lex,"64426",nine.invoke(dictionary,"64426"),true);boolean reading=false;for(Object item:list)if(value(item,"getText").equals("你好"))reading=value(item,"getReading").equals("ni hao");expect(reading,"learned ranking preserves dictionary syllables");
    expect(((List<?>)complete.invoke(lex,"我",false)).isEmpty()&&((List<?>)complete.invoke(lex,"我",true)).contains("先走了"),"learned predictions respect learning switch");
    Object reopened=lexType.getConstructor(SharedPreferences.class).newInstance(prefs);expect(((List<?>)complete.invoke(reopened,"我",true)).contains("先走了"),"asynchronous learning is immediately visible across stores");
    Class<?> configType=loader.loadClass("expo.modules.chatqkeyboard.TypingPreferences");Object config=configType.getConstructor(SharedPreferences.class).newInstance(prefs);Method update=configType.getMethod("update",JSONObject.class),snapshot=configType.getMethod("snapshot");
    expect(((JSONObject)snapshot.invoke(config)).getBoolean("predictions"),"offline predictions enabled by default");update.invoke(config,new JSONObject().put("predictions",false));update.invoke(config,new JSONObject().put("predictions","true"));expect(!((JSONObject)snapshot.invoke(config)).getBoolean("predictions"),"prediction preference validates partial updates");
    Class<?> nativeType=loader.loadClass("expo.modules.chatqkeyboard.PinyinEngine");Object engine=nativeType.getConstructor(Context.class).newInstance(context);
    try{list=(List<?>)nativeType.getMethod("decode",String.class).invoke(engine,"nihaozhongguo");expect(contains((List<?>)full.invoke(dictionary,"nihaozhongguo",list),"你好",5),"native partial consumption survives supplement merge");}finally{nativeType.getMethod("close").invoke(engine);}
    return checks;
  }
  static String benchmark(Context context) throws Exception {
    Class<?> type=context.getClassLoader().loadClass("expo.modules.chatqkeyboard.NineKeyEngine");
    long start=System.nanoTime();Object engine=type.getConstructor(Context.class).newInstance(context);
    double load=(System.nanoTime()-start)/1e6;Method decode=type.getMethod("decode",String.class);
    String[] codes={"6","64","644","6442","64426","94664486","96894432653","6442694664486","94664486"};
    long[] timings=new long[270];
    for(int i=0;i<timings.length;i++){start=System.nanoTime();decode.invoke(engine,codes[i%codes.length]);timings[i]=System.nanoTime()-start;}
    Arrays.sort(timings);JSONObject result=new JSONObject().put("loadMs",load).put("warmMedianMs",timings[timings.length/2]/1e6).put("warmP95Ms",timings[(int)(timings.length*.95)]/1e6).put("warmMaxMs",timings[timings.length-1]/1e6);
    long[] varied=new long[100];Random random=new Random(150);
    for(int i=0;i<varied.length;i++){StringBuilder code=new StringBuilder();for(int j=0;j<18;j++)code.append((char)('2'+random.nextInt(8)));start=System.nanoTime();decode.invoke(engine,code.toString());varied[i]=System.nanoTime()-start;}
    Arrays.sort(varied);result.put("uncachedRandomP95Ms",varied[95]/1e6).put("uncachedRandomMaxMs",varied[99]/1e6);
    return result.toString();
  }
}
