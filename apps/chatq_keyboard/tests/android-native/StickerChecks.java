package com.chatq.keyboardtests;
import android.content.*;
import android.graphics.*;
import android.net.Uri;
import java.lang.reflect.*;

final class StickerChecks {
  static int run(Context context) throws Exception {
    Class<?> cls=context.getClassLoader().loadClass("expo.modules.chatqkeyboard.StickerShare");
    Object helper=cls.getConstructor(Context.class).newInstance(context);Method prepare=cls.getMethod("intent",String.class);
    int checks=0;
    for(String id:new String[]{"hello","hug","thanks"}) {
      Intent chooser=(Intent)prepare.invoke(helper,id);if(!Intent.ACTION_CHOOSER.equals(chooser.getAction()))throw new AssertionError("must use system chooser");checks++;
      Intent send=chooser.getParcelableExtra(Intent.EXTRA_INTENT);Uri uri=send.getParcelableExtra(Intent.EXTRA_STREAM);
      if(!"image/png".equals(send.getType())||!"content".equals(uri.getScheme())||!uri.getAuthority().equals(context.getPackageName()+".chatq.stickers"))throw new AssertionError("scoped PNG content URI");checks++;
      if((send.getFlags()&Intent.FLAG_GRANT_READ_URI_PERMISSION)==0||(send.getFlags()&Intent.FLAG_GRANT_WRITE_URI_PERMISSION)!=0||!send.getClipData().getItemAt(0).getUri().equals(uri))throw new AssertionError("temporary read-only permission and clip data");checks++;
      Bitmap bitmap;try(java.io.InputStream in=context.getContentResolver().openInputStream(uri)){bitmap=BitmapFactory.decodeStream(in);}if(bitmap==null||Math.max(bitmap.getWidth(),bitmap.getHeight())!=512||!bitmap.hasAlpha())throw new AssertionError("shareable transparent 512px sticker");bitmap.recycle();checks++;
    }
    for(String invalid:new String[]{"../updates/update","", "unknown"}) { try { prepare.invoke(helper,invalid);throw new AssertionError("unknown IDs rejected"); } catch(InvocationTargetException expected) {if(!(expected.getCause() instanceof IllegalArgumentException))throw expected;}checks++; }
    android.content.pm.ProviderInfo provider=context.getPackageManager().resolveContentProvider(context.getPackageName()+".chatq.stickers",0);
    if(provider==null||provider.exported||!provider.grantUriPermissions)throw new AssertionError("provider must be private with explicit URI grants");checks++;
    Class<?> input=context.getClassLoader().loadClass("expo.modules.chatqkeyboard.StickerInput");
    Method supports=input.getMethod("supports",android.view.inputmethod.EditorInfo.class);
    for(String mime:new String[]{"image/png","image/*","*/*","image/jpeg","image/gif","text/plain"}) {
      android.view.inputmethod.EditorInfo info=new android.view.inputmethod.EditorInfo();info.contentMimeTypes=new String[]{mime};
      boolean expected=mime.equals("image/png")||mime.equals("image/*")||mime.equals("*/*");
      if(!Boolean.valueOf(expected).equals(supports.invoke(null,info)))throw new AssertionError("PNG MIME negotiation: "+mime);checks++;
    }
    if(!Boolean.FALSE.equals(supports.invoke(null,new Object[]{null})))throw new AssertionError("missing editor rejected");checks++;
    if(!Boolean.FALSE.equals(supports.invoke(null,new android.view.inputmethod.EditorInfo())))throw new AssertionError("missing MIME rejected");checks++;
    return checks;
  }
}
