package com.chatq.keyboardtests;

import android.content.Context;
import android.content.ContextWrapper;
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.graphics.drawable.StateListDrawable;
import java.lang.reflect.*;
import org.json.JSONObject;

// Exercises shipping drawables with an attached synthetic context; no IME registration or editor access.
final class ColorChecks {
  static int run(Context context) throws Exception {
    Class<?> type=context.getClassLoader().loadClass("expo.modules.chatqkeyboard.ChatQInputMethodService");
    Object service=type.getConstructor().newInstance();
    Method attach=ContextWrapper.class.getDeclaredMethod("attachBaseContext",Context.class);attach.setAccessible(true);attach.invoke(service,context);
    Field options=type.getDeclaredField("options");options.setAccessible(true);
    Method background=type.getDeclaredMethod("background",boolean.class,boolean.class);background.setAccessible(true);
    Method control=type.getDeclaredMethod("controlBackground",int.class,int.class);control.setAccessible(true);
    int checks=0;
    for(String theme:new String[]{"light","dark"}) {
      options.set(service,new JSONObject().put("theme",theme));
      for(StateListDrawable drawable:new StateListDrawable[]{(StateListDrawable)background.invoke(service,true,false),(StateListDrawable)control.invoke(service,Color.rgb(79,85,167),8)}) {
        for(boolean pressed:new boolean[]{false,true}) {
          drawable.setState(pressed?new int[]{android.R.attr.state_enabled,android.R.attr.state_pressed}:new int[]{android.R.attr.state_enabled});
          int fill=((GradientDrawable)drawable.getCurrent()).getColor().getDefaultColor();
          if(contrast(Color.WHITE,fill)<4.5)throw new AssertionError(theme+" primary action lost text contrast while pressed="+pressed);
          checks++;
        }
      }
    }
    return checks;
  }
  private static double luminance(int color) {
    double[] c={Color.red(color)/255.0,Color.green(color)/255.0,Color.blue(color)/255.0};
    for(int i=0;i<3;i++)c[i]=c[i]<=.04045?c[i]/12.92:Math.pow((c[i]+.055)/1.055,2.4);
    return c[0]*.2126+c[1]*.7152+c[2]*.0722;
  }
  private static double contrast(int a,int b) {double x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);}
}
