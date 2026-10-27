package expo.modules.chatqkeyboard

import android.content.SharedPreferences
import org.json.JSONArray
import org.json.JSONObject
import java.util.UUID

/** Manual labels and reply preferences only; never reads contacts or surrounding chat. */
internal class ConversationProfiles(private val prefs:SharedPreferences) {
  private fun state():JSONObject {
    val raw=prefs.getString(KEY,null)?:return JSONObject().put("version",1).put("activeId","").put("profiles",JSONArray())
    val value=validate(raw)
    val rows=value.getJSONArray("profiles");require(rows.length()<=30);val ids=mutableSetOf<String>()
    for(i in 0 until rows.length()){val row=rows.getJSONObject(i);require(row.getString("id").matches(Regex("[a-zA-Z0-9_-]{1,80}"))&&ids.add(row.getString("id")));require(validName(row.getString("name")));row.put("selection",selection(row.getJSONObject("selection")))}
    if(value.optString("activeId") !in ids)value.put("activeId","")
    return value
  }
  private fun selection(input:JSONObject):JSONObject {
    val p=PersonaPreferences(prefs);val result=JSONObject()
    for((key,list) in listOf("cardId" to "cards","sceneId" to "scenes","relationId" to "relations")) {val choices=p.choices(list).map{it.first};result.put(key,input.optString(key).takeIf{it in choices}?:if(key=="cardId")choices.firstOrNull().orEmpty() else "")}
    result.put("warmth",input.optString("warmth").takeIf{it in PersonaPreferences.warmths.map{v->v.first}}?:"")
    result.put("goalId",input.optString("goalId").takeIf{it in PersonaPreferences.goals.map{v->v.first}}?:"")
    return result
  }
  fun read():String=synchronized(GenerationStore.lock){state().toString()}
  fun save(id:String,name:String):String=synchronized(GenerationStore.lock){
    val label=name.trim();require(validName(label)){"对象名称需为1–20字，不能换行"};val value=state();val rows=value.getJSONArray("profiles")
    val index=(0 until rows.length()).firstOrNull{rows.getJSONObject(it).getString("id")==id}
    require(id.isEmpty()||index!=null){"对象档案不存在，请重新读取"};require(index!=null||rows.length()<30){"最多保存30个对象，请先整理"}
    val key=if(id.isEmpty())UUID.randomUUID().toString()else id
    val row=JSONObject().put("id",key).put("name",label).put("selection",if(index!=null)rows.getJSONObject(index).getJSONObject("selection") else selection(JSONObject(prefs.getString("personaSelection","{}")?:"{}")))
    if(index==null)rows.put(row)else rows.put(index,row)
    if(index==null)value.put("activeId",key)
    check(prefs.edit().putString(KEY,value.toString()).commit()){ "对象档案未保存" };value.toString()
  }
  fun select(id:String):String=synchronized(GenerationStore.lock){
    val value=state();val rows=value.getJSONArray("profiles");val row=(0 until rows.length()).map{rows.getJSONObject(it)}.firstOrNull{it.getString("id")==id}
    require(id.isEmpty()||row!=null){"对象档案不存在"}
    val edit=prefs.edit().putString(KEY,value.put("activeId",id).toString())
    if(row!=null){val previous=JSONObject(prefs.getString("personaSelection","{}")?:"{}");val chosen=selection(row.getJSONObject("selection"));chosen.keys().forEach{previous.put(it,chosen.get(it))};edit.putString("personaSelection",previous.toString())}
    check(edit.commit()){ "对象选择未保存" };value.toString()
  }
  fun remove(id:String):String=synchronized(GenerationStore.lock){val value=state();val rows=value.getJSONArray("profiles");val keep=JSONArray();for(i in 0 until rows.length())if(rows.getJSONObject(i).getString("id")!=id)keep.put(rows.get(i));require(keep.length()!=rows.length()){ "对象档案不存在" };value.put("profiles",keep);if(value.optString("activeId")==id)value.put("activeId","");check(prefs.edit().putString(KEY,value.toString()).commit());value.toString()}
  companion object {
    const val KEY="conversationProfiles"
    fun validate(raw:String):JSONObject{require(raw.length<=50000);val s=JSONObject(raw);require(s.getInt("version")==1);val a=s.getJSONArray("profiles");require(a.length()<=30);val ids=mutableSetOf<String>();for(i in 0 until a.length()){val row=a.getJSONObject(i);require(row.getString("id").matches(Regex("[a-zA-Z0-9_-]{1,80}"))&&ids.add(row.getString("id")));require(validName(row.getString("name")));val selection=row.getJSONObject("selection");require(selection.keys().asSequence().all{it in listOf("cardId","relationId","sceneId","warmth","goalId")});selection.keys().forEach{require(selection.getString(it).length<=80)}};require(s.getString("activeId").isEmpty()||s.getString("activeId") in ids);return s}
    fun merge(a:String,b:String):String{val first=validate(a);val incoming=validate(b).getJSONArray("profiles");val rows=first.getJSONArray("profiles");val ids=(0 until rows.length()).map{rows.getJSONObject(it).getString("id")}.toMutableSet();for(i in 0 until incoming.length())if(ids.add(incoming.getJSONObject(i).getString("id")))rows.put(incoming.getJSONObject(i));require(rows.length()<=30){ "合并后聊天对象超过30个，请先整理" };return first.toString()}
    private fun validName(name:String)=name.isNotBlank()&&name.length<=20&&name.none{it.isISOControl()}
    fun changed(prefs:SharedPreferences,selected:JSONObject,edit:SharedPreferences.Editor){
      // Damaged optional profiles must not prevent normal persona selection.
      try{val store=ConversationProfiles(prefs);val value=store.state();val rows=value.getJSONArray("profiles");val active=value.optString("activeId");for(i in 0 until rows.length())if(rows.getJSONObject(i).getString("id")==active){rows.getJSONObject(i).put("selection",store.selection(selected));edit.putString(KEY,value.toString());break}}catch(_:Exception){}
    }
  }
}
