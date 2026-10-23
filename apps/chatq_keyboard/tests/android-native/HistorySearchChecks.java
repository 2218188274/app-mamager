package com.chatq.keyboardtests;

import android.content.Context;
import android.content.ContextWrapper;
import android.content.SharedPreferences;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteOpenHelper;
import java.io.File;
import java.lang.reflect.Method;
import java.util.Arrays;
import org.json.JSONArray;

/** Synthetic records only; never opens the user's generation database. */
final class HistorySearchChecks {
  private static int checks;
  static long searchBenchmarkMs;
  private static void expect(boolean condition, String label) {
    if (!condition) throw new AssertionError(label);
    checks++;
  }
  static int run(Context original) throws Exception {
    checks = 0;
    File dir = new File(original.getCacheDir(), "chatq-history-search-test");
    dir.mkdirs();
    SharedPreferences prefs = original.getSharedPreferences("chatq_history_search_test_only", 0);
    prefs.edit().clear().commit();
    Context isolated = new ContextWrapper(original) {
      @Override public SharedPreferences getSharedPreferences(String name, int mode) { return prefs; }
      @Override public File getDatabasePath(String name) { return new File(dir, name); }
    };
    File database = isolated.getDatabasePath("chatq-generations.db");
    SQLiteDatabase.deleteDatabase(database);
    Class<?> type = original.getClassLoader().loadClass("expo.modules.chatqkeyboard.GenerationStore");
    Object store = type.getConstructor(Context.class).newInstance(isolated);
    Method save = type.getMethod("save", String.class, java.util.List.class, String.class, String.class);
    Method list = type.getMethod("list", String.class, boolean.class);
    try {
      String path = "C:\\test\\file.txt";
      save.invoke(store, "plain prompt", Arrays.asList("path " + path, "say \"example\""), "keyboard", "reply");
      expect(((JSONArray) list.invoke(store, path, false)).length() == 1, "reply search finds literal Windows path");
      expect(((JSONArray) list.invoke(store, "\"example\"", false)).length() == 1, "reply search finds literal quoted text");
      expect(((JSONArray) list.invoke(store, "[", false)).length() == 0, "JSON array delimiters are not searchable content");
      expect(((JSONArray) list.invoke(store, "\",\"", false)).length() == 0, "search never joins separate candidates");
      save.invoke(store, "100%_literal\\path", Arrays.asList("unrelated"), "app", "reply");
      save.invoke(store, "other", Arrays.asList("50%_value\\folder", "line\nbreak\tvalue"), "app", "topic");
      for (String query : new String[] {"100%_literal\\path", "50%_value\\folder", "\nbreak\t"}) {
        expect(((JSONArray) list.invoke(store, query, false)).length() == 1, "literal prompt/reply search: " + query);
      }
      expect(((JSONArray) list.invoke(store, "\\nbreak", false)).length() == 0, "JSON newline escapes are not displayed text");
      expect(((JSONArray) list.invoke(store, "nonexistent_", false)).length() == 0, "underscore is not a wildcard");
      expect(((JSONArray) list.invoke(store, "50%_valuefolder", false)).length() == 0, "backslashes cannot be omitted");
      expect(((JSONArray) list.invoke(store, "PLAIN PROMPT", false)).length() == 1, "prompt search remains case insensitive");
      expect(((JSONArray) list.invoke(store, "EXAMPLE", false)).length() == 1, "reply search remains case insensitive");
      SQLiteDatabase db = ((SQLiteOpenHelper) store).getWritableDatabase();
      db.beginTransaction();
      try {
        for (int i = 0; i < 130; i++) {
          db.execSQL("INSERT INTO records(uid,source,kind,prompt,replies,created) VALUES(?,?,?,?,?,?)",
            new Object[] {"search-limit-" + i, "app", "reply", "needle-" + i, "[\"result\"]", 1700000000000L + i});
        }
        for (int i = 0; i < 120; i++) {
          db.execSQL("INSERT INTO records(uid,source,kind,prompt,replies,created) VALUES(?,?,?,?,?,?)",
            new Object[] {"search-skip-" + i, "app", "reply", "no match", "[\"different\"]", 1700001000000L + i});
        }
        db.setTransactionSuccessful();
      } finally { db.endTransaction(); }
      JSONArray matches = (JSONArray) list.invoke(store, "needle-", false);
      expect(matches.length() == 100, "100 result limit applies after filtering newer unrelated records");
      expect(matches.getJSONObject(0).getString("prompt").equals("needle-129") && matches.getJSONObject(99).getString("prompt").equals("needle-30"), "filtered results remain newest first");
      expect(((JSONArray) list.invoke(store, "", false)).length() == 100, "empty search keeps the normal result limit");
      expect(((JSONArray) list.invoke(store, "", true)).length() == 253, "backup export still includes every record");
      db.beginTransaction();
      try {
        String longReply = String.join("", java.util.Collections.nCopies(100, "候选片段"));
        String serialized = new JSONArray().put(longReply).put(longReply).put(longReply).toString();
        for (int i = 0; i < 1000; i++) {
          db.execSQL("INSERT INTO records(uid,source,kind,prompt,replies,created) VALUES(?,?,?,?,?,?)",
            new Object[] {"search-bench-" + i, "keyboard", "reply", "benchmark prompt", serialized, 1700002000000L + i});
        }
        db.setTransactionSuccessful();
      } finally { db.endTransaction(); }
      long started = android.os.SystemClock.elapsedRealtime();
      expect(((JSONArray) list.invoke(store, "definitely absent token", false)).length() == 0, "full search across long synthetic candidates returns no false matches");
      searchBenchmarkMs = android.os.SystemClock.elapsedRealtime() - started;
      return checks;
    } finally {
      ((SQLiteOpenHelper) store).close();
      SQLiteDatabase.deleteDatabase(database);
      prefs.edit().clear().commit();
    }
  }
}
