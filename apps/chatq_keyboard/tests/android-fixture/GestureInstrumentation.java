package com.chatq.keyboardfixture;
import android.app.Instrumentation;
import android.content.Intent;
import android.os.Bundle;
import android.os.SystemClock;
import android.view.InputDevice;
import android.view.MotionEvent;
/** Rapid double tap uses injected UI events; adb input starts a new VM for every tap. */
public final class GestureInstrumentation extends Instrumentation {
  @Override public void onCreate(Bundle args) { super.onCreate(args); start(); }
  private void tap(int x, int y) {
    long now = SystemClock.uptimeMillis();
    MotionEvent down = MotionEvent.obtain(now, now, MotionEvent.ACTION_DOWN, x, y, 0); down.setSource(InputDevice.SOURCE_TOUCHSCREEN);
    getUiAutomation().injectInputEvent(down, true); down.recycle();
    MotionEvent up = MotionEvent.obtain(now, SystemClock.uptimeMillis(), MotionEvent.ACTION_UP, x, y, 0); up.setSource(InputDevice.SOURCE_TOUCHSCREEN);
    getUiAutomation().injectInputEvent(up, true); up.recycle(); SystemClock.sleep(60);
  }
  @Override public void onStart() {
    Bundle result = new Bundle();
    try {
      final android.app.Activity activity = startActivitySync(new Intent(getTargetContext(), FixtureActivity.class).putExtra("seed", "Q").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
      SystemClock.sleep(1000);
      tap(24,560); tap(24,560); tap(32,508); tap(191,560); tap(24,560); tap(127,560);
      final String[] actual = new String[1];
      runOnMainSync(new Runnable() { public void run() { actual[0] = ((android.widget.EditText) ((FixtureActivity) activity).findViewById(101)).getText().toString(); } });
      if (!"ABc".equals(actual[0])) throw new AssertionError("Caps lock expected ABc, received " + actual[0]);
      result.putString("stream", "PASS double tap caps lock\n"); finish(-1,result);
    } catch(Throwable e) { result.putString("stream", e.toString()); finish(1,result); }
  }
}
