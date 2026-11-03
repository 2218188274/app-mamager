using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using ChatQ.Windows;

internal static class FeatureChecks
{
    public static async Task Run(string root,string? fixture,Action<bool,string> check)
    {
        void Reject(Action action,string name){bool rejected=false;try{action();}catch(Exception e) when(e is InvalidOperationException or CryptographicException){rejected=true;}check(rejected,name);}
        var profile=new ApiProfile("local","本机配置",fixture??"https://example.invalid/v1","fixture-model","synthetic-test-key");
        var legacy=new UserState {Version=1,Profiles=[profile],ProfileId=profile.Id};var node=JsonSerializer.SerializeToNode(legacy,Defaults.Json)!.AsObject();
        foreach(string name in new[]{"ReplyHistory","Stickers","StickerFavorites","TopicDraft"})node.Remove(name);node["Profiles"]![0]!.AsObject().Remove("SpeechModel");
        var migration=new Vault(Path.Combine(root,"migration"));Directory.CreateDirectory(migration.DirectoryPath);File.WriteAllBytes(Path.Combine(migration.DirectoryPath,"data.vault"),DeviceEncryption.Protect(Encoding.UTF8.GetBytes(node.ToJsonString())));
        check(migration.Read().ActiveProfile!.SpeechModel=="whisper-1" && migration.Read().ReplyHistory.Count==0,"old schema loads defaults without losing provider");
        migration.Update(s=>s.TopicDraft="迁移后的草稿");check(migration.Read().Version==2 && migration.Read().ActiveProfile!.Key==profile.Key,"expanded data upgrades format and preserves credentials");
        migration.Update(s=>s.ReplyDraft="后续草稿");check(Directory.GetFiles(migration.DirectoryPath,"*.v1-*.bak").Any(p=>JsonSerializer.Deserialize<UserState>(DeviceEncryption.Unprotect(File.ReadAllBytes(p)),Defaults.Json)!.Version==1),"pre-upgrade format1 rollback retained after later writes");
        var source=new UserState {Profiles=[profile],ProfileId=profile.Id,ReplyDraft="需要备份的草稿",Conversations=[new Conversation {Name="合成会话",Messages=[new("user","合成问题"),new("assistant","合成回答")]}]};
        HistoryPolicy.Add(source,["备份里的建议"],"合成原文","reply","自然真诚");
        byte[] encrypted=PortableBackup.Encrypt(source,"test-backup-passphrase"),again=PortableBackup.Encrypt(source,"test-backup-passphrase");
        check(!encrypted.SequenceEqual(again),"random salt and nonce make separate backups distinct");check(!Encoding.UTF8.GetString(encrypted).Contains(source.ReplyDraft),"portable backup is not plaintext");
        var data=PortableBackup.Decrypt(encrypted,"test-backup-passphrase");check(data.Conversations.Count==1 && data.ReplyDraft==source.ReplyDraft && data.ReplyHistory.Count==1,"backup contains conversations drafts and reply history");
        check(!JsonSerializer.Serialize(data,Defaults.Json).Contains(profile.Key) && data.ToState().Profiles.Count==0,"portable schema excludes provider credentials");
        Reject(()=>PortableBackup.Decrypt(encrypted,"incorrect-password"),"wrong backup password rejected");var changed=encrypted.ToArray();changed[48]^=1;Reject(()=>PortableBackup.Decrypt(changed,"test-backup-passphrase"),"tampered ciphertext rejected");changed=encrypted.ToArray();changed[28]^=1;Reject(()=>PortableBackup.Decrypt(changed,"test-backup-passphrase"),"tampered nonce rejected");Reject(()=>PortableBackup.Decrypt(encrypted[..40],"test-backup-passphrase"),"truncated backup rejected before KDF");Reject(()=>PortableBackup.Encrypt(source,"short"),"short backup password rejected");
        var restore=new Vault(Path.Combine(root,"restore"));restore.SaveProfile(profile);restore.Restore(data,false);check(restore.Read().ActiveProfile!.Key==profile.Key && restore.Read().Conversations.Count==1,"restore preserves local API configuration");restore.Restore(data,true);check(restore.Read().Conversations.Count==1,"merge does not duplicate same conversation ID");
        restore.Update(s=>s.Conversations=Enumerable.Range(0,50).Select(i=>new Conversation {Name="已有"+i}).ToList());byte[] before=File.ReadAllBytes(Path.Combine(restore.DirectoryPath,"data.vault"));Reject(()=>restore.Restore(data,true),"over-capacity merge is rejected");check(File.ReadAllBytes(Path.Combine(restore.DirectoryPath,"data.vault")).SequenceEqual(before),"failed merge does not change original file");
        byte[] priorRollback=File.ReadAllBytes(Path.Combine(restore.DirectoryPath,"data.vault.bak")),corrupt=Encoding.UTF8.GetBytes("synthetic-unreadable-vault");File.WriteAllBytes(Path.Combine(restore.DirectoryPath,"data.vault"),corrupt);Reject(()=>restore.Restore(data,false),"unreadable vault requires explicit recovery choice");restore.Restore(data,false,true);check(restore.Read().Conversations.Count==1 && restore.Read().Profiles.Count==0,"explicit unreadable recovery restores user data without credentials");check(File.ReadAllBytes(Path.Combine(restore.DirectoryPath,"data.vault.bak")).SequenceEqual(priorRollback) && Directory.GetFiles(restore.DirectoryPath,"*.unreadable-*.bak").Any(p=>File.ReadAllBytes(p).SequenceEqual(corrupt)),"unreadable original and prior encrypted rollback both preserved");
        var history=new UserState {ReplyHistory=Enumerable.Range(0,100).Select(i=>new SavedReply(i.ToString(),"建议","原文","reply","自然真诚",DateTime.UtcNow.AddMinutes(-i),i==99)).ToList()};HistoryPolicy.Add(history,["新建议1","新建议2"],"新原文","reply","自然真诚");check(history.ReplyHistory.Count==100 && history.ReplyHistory.Any(x=>x.Id=="99"),"history pruning retains favorites");history.ReplyHistory=history.ReplyHistory.Select(x=>x with {Favorite=true}).ToList();Reject(()=>HistoryPolicy.Add(history,["新建议"],"原文","reply","自然真诚"),"full favorites are never silently evicted");
        byte[] wav=AudioClip.Wave(new byte[32000]);check(AudioClip.Duration(wav)==1,"recorded PCM wrapper duration");var broken=wav.ToArray();broken[4]^=1;Reject(()=>AudioClip.Duration(broken),"invalid WAV length rejected");Reject(()=>AudioClip.Duration(AudioClip.Wave(new byte[32000*121])),"oversized recording rejected");Reject(()=>Validation.Profile(profile with {SpeechModel="bad\nmodel"}),"invalid speech model rejected");
        string feed=JsonSerializer.Serialize(new DesktopUpdate("0.3.0","https://lt.youling.lol/downloads/ChatQ-Windows-0.3.0-x64-Setup.exe",new string('a',64),"合成更新"));check(UpdateFeed.Parse(feed).Version=="0.3.0","trusted update manifest accepted");Reject(()=>UpdateFeed.Parse(feed.Replace("lt.youling.lol","other.invalid")),"update cannot redirect to another host");Reject(()=>UpdateFeed.Parse(feed.Replace(new string('a',64),"bad")),"update checksum required");
        var lines=PersonalAi.ParseScreenshot("{\"messages\":[{\"side\":\"left\",\"text\":\"合成消息\"},{\"side\":\"right\",\"text\":\"合成回复\"}]}");check(lines.Count==2 && lines[0].Side=="left","screenshot sides remain explicit");Reject(()=>PersonalAi.ParseScreenshot("{\"messages\":[{\"side\":\"system\",\"text\":\"x\"}]}"),"unexpected screenshot role rejected");
        byte[] png=new byte[64];new byte[]{137,80,78,71,13,10,26,10}.CopyTo(png,0);"IHDR"u8.CopyTo(png.AsSpan(12));System.Buffers.Binary.BinaryPrimitives.WriteInt32BigEndian(png.AsSpan(16),8);System.Buffers.Binary.BinaryPrimitives.WriteInt32BigEndian(png.AsSpan(20),8);check(ImageHeader.Dimensions(png)==(8,8),"PNG dimensions checked before decoding");var huge=png.ToArray();System.Buffers.Binary.BinaryPrimitives.WriteInt32BigEndian(huge.AsSpan(16),100000);Reject(()=>ImageHeader.Dimensions(huge),"decompression bomb dimensions rejected before decoding");
        if(fixture is not null)
        {
            using var ai=new PersonalAi();using var timeout=new CancellationTokenSource(10000);
            check((await ai.RecognizeScreenshot(profile,png,timeout.Token)).Count==2,"vision request uses synthetic multipart message format");
            check(await ai.Transcribe(profile,wav,timeout.Token)=="合成语音文字","audio multipart request through local provider");
            bool rejected=false;try{await ai.Transcribe(profile with {SpeechModel="fixture-redirect"},wav,timeout.Token);}catch(InvalidOperationException){rejected=true;}check(rejected,"audio provider redirect blocked");
            rejected=false;try{await ai.RecognizeScreenshot(profile with {Model="fixture-redirect"},png,timeout.Token);}catch(InvalidOperationException){rejected=true;}check(rejected,"vision provider redirect blocked");
            using var cancel=new CancellationTokenSource(100);bool canceled=false;try{await ai.Transcribe(profile with {SpeechModel="fixture-slow"},wav,cancel.Token);}catch(OperationCanceledException){canceled=true;}check(canceled,"audio request can be cancelled without retry");
        }
    }
}
