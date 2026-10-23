package com.chatq.keyboardfixture;
import android.app.Activity;
import android.os.Bundle;
import android.text.InputType;
import android.widget.*;
import android.view.KeyEvent;
import android.view.inputmethod.EditorInfo;
// Separate application to exercise the shipped IME through real InputConnection.
// Test APK only: no network permission, no dependency on the ChatQ host UI.
public final class FixtureActivity extends Activity {
  private final android.content.BroadcastReceiver edits = new android.content.BroadcastReceiver() {
    public void onReceive(android.content.Context context, android.content.Intent intent) {
      EditText field=findViewById(101);
      if(intent.hasExtra("text")) field.setText(intent.getStringExtra("text"));
      int position=intent.getIntExtra("cursor",-1);
      if(position>=0) field.setSelection(Math.min(position,field.length()));
      if(intent.getBooleanExtra("selectAll",false)) field.selectAll();
      if(intent.getBooleanExtra("restart",false)) ((android.view.inputmethod.InputMethodManager)getSystemService(INPUT_METHOD_SERVICE)).restartInput(field);
    }
  };
  @Override public void onCreate(Bundle state) {
    super.onCreate(state);
    LinearLayout root = new LinearLayout(this); root.setOrientation(LinearLayout.VERTICAL);
    root.setPadding(12, 4, 12, 4); setContentView(root);
    add(root, "Text", 101, InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_MULTI_LINE);
    add(root, "Email", 102, InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS);
    add(root, "Password", 103, InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_PASSWORD);
    add(root, "Number", 104, InputType.TYPE_CLASS_NUMBER);
    final EditText first = findViewById(101);
    android.content.IntentFilter filter=new android.content.IntentFilter("com.chatq.keyboardfixture.EDIT");
    if(android.os.Build.VERSION.SDK_INT>=33) registerReceiver(edits,filter,android.content.Context.RECEIVER_EXPORTED); else registerReceiver(edits,filter);
    final TextView action = new TextView(this); action.setId(201); action.setText("action:0 count:0"); root.addView(action);
    String mode = getIntent().getStringExtra("mode");
    if ("search".equals(mode) || "send".equals(mode) || "next".equals(mode) || "done".equals(mode)) { first.setInputType(InputType.TYPE_CLASS_TEXT); first.setSingleLine(true); }
    if ("search".equals(mode)) first.setImeOptions(EditorInfo.IME_ACTION_SEARCH);
    if ("send".equals(mode)) first.setImeOptions(EditorInfo.IME_ACTION_SEND);
    if ("next".equals(mode)) first.setImeOptions(EditorInfo.IME_ACTION_NEXT);
    if ("done".equals(mode)) first.setImeOptions(EditorInfo.IME_ACTION_DONE);
    if ("private".equals(mode)) first.setImeOptions(EditorInfo.IME_FLAG_NO_PERSONALIZED_LEARNING);
    if ("multiline".equals(mode)) { first.setSingleLine(false); first.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_MULTI_LINE); first.setImeOptions(EditorInfo.IME_ACTION_SEND | EditorInfo.IME_FLAG_NO_ENTER_ACTION); }
    if ("uri".equals(mode)) first.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_URI);
    if ("phone".equals(mode)) first.setInputType(InputType.TYPE_CLASS_PHONE);
    if ("decimal".equals(mode)) first.setInputType(InputType.TYPE_CLASS_NUMBER | InputType.TYPE_NUMBER_FLAG_DECIMAL | InputType.TYPE_NUMBER_FLAG_SIGNED);
    if ("password".equals(mode)) first.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_PASSWORD);
    first.setOnEditorActionListener(new TextView.OnEditorActionListener() { int count = 0; public boolean onEditorAction(TextView view, int id, KeyEvent event) { action.setText("action:" + id + " count:" + (++count)); return true; } });
    String seed = getIntent().getStringExtra("seed");
    if(getIntent().hasExtra("seed64")) seed=new String(android.util.Base64.decode(getIntent().getStringExtra("seed64"),android.util.Base64.DEFAULT),java.nio.charset.StandardCharsets.UTF_8);
    if (seed != null) {
      EditText field = findViewById(101); field.setText(seed); field.requestFocus();
      int start = getIntent().getIntExtra("start", 0), end = getIntent().getIntExtra("end", seed.length());
      field.setSelection(Math.min(start, seed.length()), Math.min(end, seed.length()));
      field.postDelayed(new Runnable() { public void run() { ((android.view.inputmethod.InputMethodManager)getSystemService(INPUT_METHOD_SERVICE)).showSoftInput(field, android.view.inputmethod.InputMethodManager.SHOW_IMPLICIT); } }, 350);
    }
  }
  @Override public void onDestroy() { unregisterReceiver(edits); super.onDestroy(); }
  private void add(LinearLayout root, String name, int id, int type) {
    EditText field = new EditText(this); field.setId(id); field.setHint(name); field.setSingleLine(true); field.setInputType(type);
    field.setTextSize(16); root.addView(field, new LinearLayout.LayoutParams(-1, 60));
  }
}
