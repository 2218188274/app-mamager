package expo.modules.chatqkeyboard

/** One system picker / restore at a time across native and shared backups. */
internal object BackupFileLease {
  private var owner:Any?=null
  @Synchronized fun acquire(value:Any):Boolean {if(owner!=null)return false;owner=value;return true}
  @Synchronized fun release(value:Any){if(owner===value)owner=null}
}
