package com.chatq.keyboardtests;
import android.app.*;import android.content.*;import android.net.Uri;import java.lang.reflect.*;import java.util.concurrent.*;import java.util.concurrent.atomic.*;

/** Isolated shipping exporter lifecycle/error tests. Fake picker captures intents; no user files. */
final class ExportChecks {
 static int checks;static void expect(boolean ok,String text){if(!ok)throw new AssertionError(text);checks++;}
 static final class Picker extends Activity {Context context;volatile Intent intent;volatile int code;volatile CountDownLatch opened=new CountDownLatch(1);public Context getApplicationContext(){return context;}public void startActivityForResult(Intent intent,int code){this.intent=intent;this.code=code;opened.countDown();}}
 static final class Result implements InvocationHandler {final CountDownLatch done=new CountDownLatch(1);final AtomicInteger calls=new AtomicInteger();volatile String value,error;public Object invoke(Object p,Method method,Object[] args){if(method.getName().equals("resolve")){value=args==null||args.length==0?null:String.valueOf(args[0]);calls.incrementAndGet();done.countDown();}else if(method.getName().equals("reject")){error=args.length>1?String.valueOf(args[1]):"rejected";calls.incrementAndGet();done.countDown();}return null;}}
 static void reject(Method method,Object target,Object...args)throws Exception{try{method.invoke(target,args);throw new AssertionError("accepted invalid export");}catch(InvocationTargetException expected){checks++;}}
 static int run(final Instrumentation instrumentation)throws Exception {
  final Context context=instrumentation.getTargetContext();final AtomicReference<Picker> host=new AtomicReference<>();instrumentation.runOnMainSync(new Runnable(){public void run(){Picker picker=new Picker();picker.context=context;host.set(picker);}});final Picker picker=host.get();ClassLoader loader=context.getClassLoader();Class<?> function=loader.loadClass("kotlin.jvm.functions.Function0"),promise=loader.loadClass("expo.modules.kotlin.Promise"),type=loader.loadClass("expo.modules.chatqkeyboard.ChatExports");Object provider=Proxy.newProxyInstance(loader,new Class<?>[]{function},new InvocationHandler(){public Object invoke(Object p,Method m,Object[] a){return picker;}});Object exporter=type.getConstructor(function).newInstance(provider);Method start=type.getMethod("start",String.class,String.class,promise),result=type.getMethod("result",int.class,int.class,Intent.class),destroy=type.getMethod("destroy");
  try {
   Result invalid=new Result();Object invalidPromise=Proxy.newProxyInstance(loader,new Class<?>[]{promise},invalid);reject(start,exporter,"","txt",invalidPromise);reject(start,exporter,"test","html",invalidPromise);expect(picker.intent==null,"invalid export never opens a picker");
   int previous=-1;
   for(int n=0;n<4;n++) {Result state=new Result();Object proxy=Proxy.newProxyInstance(loader,new Class<?>[]{promise},state);picker.opened=new CountDownLatch(1);start.invoke(exporter,"合成导出🙂",n==1?"md":"txt",proxy);expect(picker.opened.await(3,TimeUnit.SECONDS),"valid export opens picker");int code=picker.code;expect(code!=previous&&picker.intent.getAction().equals(Intent.ACTION_CREATE_DOCUMENT),"each explicit export gets a distinct picker result code");expect(picker.intent.getType().equals(n==1?"text/markdown":"text/plain"),"correct MIME type");reject(start,exporter,"duplicate","txt",invalidPromise);result.invoke(exporter,previous,Activity.RESULT_OK,new Intent().setData(Uri.parse("content://chatq.invalid/old")));expect(state.calls.get()==0,"stale picker result cannot affect active export");
    if(n==0){result.invoke(exporter,code,Activity.RESULT_CANCELED,null);expect(state.done.await(2,TimeUnit.SECONDS)&&"cancelled".equals(state.value),"system cancellation resolves without writing");}
    if(n==1){result.invoke(exporter,code,Activity.RESULT_OK,new Intent().setData(Uri.parse("file:///invalid")));expect(state.done.await(2,TimeUnit.SECONDS)&&state.error.contains("保存位置无效"),"non-content URI rejected before writing");}
    if(n==2){result.invoke(exporter,code,Activity.RESULT_OK,new Intent().setData(Uri.parse("content://chatq.invalid/missing-provider")));expect(state.done.await(3,TimeUnit.SECONDS)&&state.error.contains("文件保存失败"),"provider write failure surfaces without success");}
    if(n==3){destroy.invoke(exporter);expect(state.done.await(2,TimeUnit.SECONDS)&&"cancelled".equals(state.value),"module destruction releases pending export");}
    result.invoke(exporter,code,Activity.RESULT_CANCELED,null);expect(state.calls.get()==1,"duplicate result settles promise only once");previous=code;
   }
   reject(start,exporter,"after destroy","txt",invalidPromise);return checks;
  }finally{destroy.invoke(exporter);}
 }
}
