package com.chatq.keyboardtests;

import android.content.Context;
import android.content.SharedPreferences;
import java.io.*;
import java.lang.reflect.*;
import java.net.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicReference;
import org.json.JSONObject;

/** Exercises the shipping HTTP client against a bounded loopback server. No live API credentials. */
final class InputNetworkChecks {
  static final class Server implements AutoCloseable {
    final ServerSocket server = new ServerSocket(0);
    final CountDownLatch received = new CountDownLatch(1), release = new CountDownLatch(1), disconnected = new CountDownLatch(1);
    volatile JSONObject payload;
    volatile Socket socket;
    Server(String body, boolean stall) throws Exception {
      Thread worker = new Thread(new Runnable() { public void run() {
        try (Socket client = server.accept()) {
          socket = client; client.setSoTimeout(3000);
          InputStream input = client.getInputStream(); ByteArrayOutputStream headers = new ByteArrayOutputStream();
          int value; String header = "";
          while ((value = input.read()) >= 0 && headers.size() < 8192) { headers.write(value); header = headers.toString("UTF-8"); if (header.endsWith("\r\n\r\n")) break; }
          int length = 0; for (String line : header.split("\r\n")) if (line.toLowerCase(java.util.Locale.ROOT).startsWith("content-length:")) length = Integer.parseInt(line.substring(15).trim());
          ByteArrayOutputStream requestBody = new ByteArrayOutputStream();
          for (int i=0;i<length;i++) { int b=input.read(); if(b<0) break; requestBody.write(b); }
          payload = new JSONObject(requestBody.toString("UTF-8"));
          byte[] bytes = body.getBytes("UTF-8"); OutputStream output = client.getOutputStream();
          output.write(("HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nConnection: close\r\nContent-Length: " + bytes.length + "\r\n\r\n").getBytes("UTF-8")); output.flush(); received.countDown();
          if(stall) { try { if(input.read()==-1) disconnected.countDown(); } catch(SocketTimeoutException waiting) { release.await(1,TimeUnit.SECONDS); } catch(IOException closed) { disconnected.countDown(); } }
          output.write(bytes); output.flush();
        } catch(Exception ignored) { received.countDown(); }
      } }, "chatq-network-fixture"); worker.setDaemon(true); worker.start();
    }
    public void close() throws Exception { release.countDown(); server.close(); if(socket!=null)socket.close(); }
  }
  private static Throwable unwrap(Throwable error) { return error instanceof InvocationTargetException ? ((InvocationTargetException)error).getCause() : error; }
  private static void expect(boolean value, String label) { if(!value)throw new AssertionError(label); }
  static int run(Context context, SharedPreferences prefs) throws Exception {
    ClassLoader loader=context.getClassLoader();Class<?> type=loader.loadClass("expo.modules.chatqkeyboard.InputApi"), function=loader.loadClass("kotlin.jvm.functions.Function0");
    Object client=type.getConstructor(SharedPreferences.class).newInstance(prefs);
    Method post=type.getMethod("post",String.class,JSONObject.class,int.class,function), cancel=type.getMethod("cancel");
    Object yes=java.lang.reflect.Proxy.newProxyInstance(loader,new Class<?>[]{function},new InvocationHandler(){public Object invoke(Object proxy,Method method,Object[] args){return true;}}), no=java.lang.reflect.Proxy.newProxyInstance(loader,new Class<?>[]{function},new InvocationHandler(){public Object invoke(Object proxy,Method method,Object[] args){return false;}});
    try { post.invoke(client,"lexicon",new JSONObject(),500,no);throw new AssertionError("stale request accepted"); } catch(InvocationTargetException error){expect(unwrap(error) instanceof CancellationException,"stale request is rejected before opening a connection");}
    int count=1;
    prefs.edit().putString("apiKey","test-only").putString("deviceId","test-only").commit();
    try(Server server=new Server("{\"success\":true,\"data\":{}}",true)) {
      prefs.edit().putString("baseUrl","http://localhost:"+server.server.getLocalPort()).commit();
      long started=android.os.SystemClock.elapsedRealtime();
      try { post.invoke(client,"lexicon",new JSONObject(),250,yes);throw new AssertionError("timeout accepted"); } catch(InvocationTargetException error){expect(unwrap(error) instanceof SocketTimeoutException,"slow cloud lookup times out");}
      expect(android.os.SystemClock.elapsedRealtime()-started<3000,"lookup timeout is bounded");count+=2;
    }
    char[] padding=new char[34000];java.util.Arrays.fill(padding,'x');
    try(Server server=new Server("{\"success\":true,\"data\":{\"text\":\""+new String(padding)+"\"}}",false)) {
      prefs.edit().putString("baseUrl","http://localhost:"+server.server.getLocalPort()).commit();
      try { post.invoke(client,"lexicon",new JSONObject(),1000,yes);throw new AssertionError("oversized response accepted"); } catch(InvocationTargetException error){expect(unwrap(error) instanceof IllegalStateException,"oversized response is rejected");count++;}
    }
    try(Server server=new Server("{\"success\":true,\"data\":{}}",true)) {
      prefs.edit().putString("baseUrl","http://localhost:"+server.server.getLocalPort()).commit();
      AtomicReference<Throwable> error=new AtomicReference<>();
      Thread request=new Thread(new Runnable(){public void run(){try{post.invoke(client,"reply",new JSONObject(),10000,yes);}catch(Throwable failure){error.set(unwrap(failure));}}});
      request.start();expect(server.received.await(3,TimeUnit.SECONDS),"request reaches fixture");
      expect(server.payload.getString("requestId").matches("[a-zA-Z0-9_-]{16,80}"),"reply has replay protection ID");count++;
      long started=android.os.SystemClock.elapsedRealtime();cancel.invoke(client);request.join(1500);
      expect(!request.isAlive() && error.get()!=null && android.os.SystemClock.elapsedRealtime()-started<2000,"cancellation promptly releases an active request");count++;
      expect(server.disconnected.await(2,TimeUnit.SECONDS),"cancellation closes the actual HTTP transport");count++;
    }
    try(Server server=new Server("{\"success\":true,\"data\":{\"text\":\"ready\"}}",false)) {
      prefs.edit().putString("baseUrl","http://localhost:"+server.server.getLocalPort()).commit();
      JSONObject response=(JSONObject)post.invoke(client,"lexicon",new JSONObject(),1000,yes);
      expect("ready".equals(response.getString("text")),"new request succeeds after cancellation");count++;
    }
    String replyId;
    try(Server server=new Server("{\"success\":true,\"data\":{}}",false)) {
      prefs.edit().putString("baseUrl","http://localhost:"+server.server.getLocalPort()).commit();
      post.invoke(client,"reply",new JSONObject(),1000,yes); replyId=server.payload.getString("requestId");
    }
    try(Server server=new Server("{\"success\":true,\"data\":{}}",false)) {
      prefs.edit().putString("baseUrl","http://localhost:"+server.server.getLocalPort()).commit();
      post.invoke(client,"topics",new JSONObject(),1000,yes);
      expect(!replyId.equals(server.payload.getString("requestId")),"explicit subsequent generation uses a new request ID"); count++;
    }
    return count;
  }
}
