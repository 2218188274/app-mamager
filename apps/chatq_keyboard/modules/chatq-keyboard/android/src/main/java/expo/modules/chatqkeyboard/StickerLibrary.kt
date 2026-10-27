package expo.modules.chatqkeyboard
import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.util.Base64
import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.util.UUID

/** Small, bounded local image collection; backup includes these pixels under encryption. */
internal class StickerLibrary(private val context:Context){
 private val prefs=context.getSharedPreferences("chatq_keyboard",Context.MODE_PRIVATE)
 private fun state():JSONObject=validate(prefs.getString(KEY,null)?:"{\"version\":1,\"items\":[],\"favorites\":[],\"recent\":[]}")
 private fun rows(value:JSONObject):List<JSONObject>{val a=value.getJSONArray("items");return (0 until a.length()).map{a.getJSONObject(it)}}
 private fun save(value:JSONObject):String{check(prefs.edit().putString(KEY,value.toString()).commit()){ "表情库未保存，请重试" };return list()}
 fun list():String=synchronized(GenerationStore.lock){val s=state();val all=JSONArray();builtins.forEach{(id,name)->all.put(JSONObject().put("id",id).put("name",name).put("custom",false))};rows(s).forEach{all.put(JSONObject(it.toString()).put("custom",true))};JSONObject().put("items",all).put("favorites",s.getJSONArray("favorites")).put("recent",s.getJSONArray("recent")).toString()}
 fun content(id:String):String?=synchronized(GenerationStore.lock){require(id in builtins||id.matches(Regex("custom-[a-f0-9-]{36}"))){ "表情不存在" };if(id in builtins)null else rows(state()).firstOrNull{it.getString("id")==id}?.getString("content")?:throw IllegalArgumentException("表情已删除")}
 fun add(raw:String):String=synchronized(GenerationStore.lock){require(raw.length<=700500);val image=JSONObject(raw);val mime=image.getString("mime");require(mime in listOf("image/png","image/jpeg"));val data=image.getString("content");require(data.startsWith("data:$mime;base64,"));val bytes=Base64.decode(data.substringAfter(','),Base64.NO_WRAP);val bounds=BitmapFactory.Options().apply{inJustDecodeBounds=true};BitmapFactory.decodeByteArray(bytes,0,bytes.size,bounds);require(bounds.outWidth in 1..1280&&bounds.outHeight in 1..1280)
  val source=requireNotNull(BitmapFactory.decodeByteArray(bytes,0,bytes.size));val output=ByteArrayOutputStream()
  try{for(side in listOf(512,384,256,192,128)){val factor=minOf(1f,side.toFloat()/maxOf(source.width,source.height));val bitmap=Bitmap.createScaledBitmap(source,maxOf(1,(source.width*factor).toInt()),maxOf(1,(source.height*factor).toInt()),true);try{output.reset();bitmap.compress(Bitmap.CompressFormat.PNG,100,output)}finally{if(bitmap!==source)bitmap.recycle()};if(output.size()<=131072)break}}finally{source.recycle()}
  require(output.size()<=131072){ "图片过于复杂，请裁剪后重试" };val s=state();val items=s.getJSONArray("items");require(items.length()<20){ "最多导入20张图片，请先整理" };items.put(JSONObject().put("id","custom-"+UUID.randomUUID()).put("name",image.optString("name","我的表情").substringBeforeLast('.').filterNot{it.isISOControl()}.take(20).ifBlank{"我的表情"}).put("content","data:image/png;base64,"+Base64.encodeToString(output.toByteArray(),Base64.NO_WRAP)));save(s)
 }
 fun update(id:String,name:String,favorite:Boolean):String=synchronized(GenerationStore.lock){content(id);val s=state();if(id !in builtins){val row=rows(s).first{it.getString("id")==id};require(name.trim().isNotEmpty()&&name.length<=20&&name.none{it.isISOControl()});row.put("name",name.trim())};val ids=(0 until s.getJSONArray("favorites").length()).map{s.getJSONArray("favorites").getString(it)}.filter{it!=id}.toMutableList();if(favorite)ids.add(id);s.put("favorites",JSONArray(ids));save(s)}
 fun remove(id:String):String=synchronized(GenerationStore.lock){require(id !in builtins){ "内置表情不能删除" };content(id);val s=state();s.put("items",JSONArray(rows(s).filter{it.getString("id")!=id}));for(key in listOf("favorites","recent")){val a=s.getJSONArray(key);s.put(key,JSONArray((0 until a.length()).map{a.getString(it)}.filter{it!=id}))};save(s)}
 fun touch(id:String)=synchronized(GenerationStore.lock){content(id);val s=state();val a=s.getJSONArray("recent");s.put("recent",JSONArray((listOf(id)+(0 until a.length()).map{a.getString(it)}).distinct().take(12)));save(s);Unit}
 companion object {
  const val KEY="customStickerLibrary";val builtins=linkedMapOf("hello" to "嗨，你好","hug" to "给你抱抱","thanks" to "谢谢你呀")
  fun validate(raw:String):JSONObject{require(raw.length<=3600000);val s=JSONObject(raw);require(s.getInt("version")==1);val items=s.getJSONArray("items");require(items.length()<=20);val ids=builtins.keys.toMutableSet();for(i in 0 until items.length()){val row=items.getJSONObject(i);val id=row.getString("id");require(id.matches(Regex("custom-[a-f0-9-]{36}"))&&ids.add(id));val name=row.getString("name");require(name.isNotBlank()&&name.length<=20&&name.none{it.isISOControl()});val content=row.getString("content");require(content.length<=175000&&content.matches(Regex("data:image/png;base64,[A-Za-z0-9+/]+={0,2}")));val bytes=Base64.decode(content.substringAfter(','),Base64.NO_WRAP);val b=BitmapFactory.Options().apply{inJustDecodeBounds=true};BitmapFactory.decodeByteArray(bytes,0,bytes.size,b);require(b.outWidth in 1..512&&b.outHeight in 1..512)};for(key in listOf("favorites","recent")){val a=s.getJSONArray(key);require(a.length()<=23);for(i in 0 until a.length())require(a.getString(i) in ids)};return s}
  fun merge(a:String,b:String):String{val first=validate(a);val second=validate(b);val items=first.getJSONArray("items");val ids=(0 until items.length()).map{items.getJSONObject(it).getString("id")}.toMutableSet();val incoming=second.getJSONArray("items");for(i in 0 until incoming.length())if(ids.add(incoming.getJSONObject(i).getString("id")))items.put(incoming.getJSONObject(i));require(items.length()<=20){ "合并后图片表情超过20张，请先整理" };for(key in listOf("favorites","recent")){val x=first.getJSONArray(key);val y=second.getJSONArray(key);first.put(key,JSONArray(((0 until x.length()).map{x.getString(it)}+(0 until y.length()).map{y.getString(it)}).distinct().take(if(key=="recent")12 else 23)))};return validate(first.toString()).toString()}
 }
}
