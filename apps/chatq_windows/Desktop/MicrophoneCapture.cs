using System.IO;
using System.Runtime.InteropServices;

namespace ChatQ.Windows;

// Event-driven WinMM recording. No device is opened until the user explicitly starts recording.
// All native buffer operations run on the same worker, outside any device callback.
public sealed class MicrophoneCapture : IDisposable
{
    [StructLayout(LayoutKind.Sequential,Pack=2)] private struct Format {public ushort Tag,Channels;public uint Rate,ByteRate;public ushort Align,Bits,Extra;}
    [StructLayout(LayoutKind.Sequential)] private struct Header {public IntPtr Data;public uint Length,Recorded;public UIntPtr User;public uint Flags,Loops;public IntPtr Next;public UIntPtr Reserved;}
    [DllImport("winmm.dll")] private static extern uint waveInOpen(out IntPtr device,uint id,ref Format format,IntPtr callback,IntPtr instance,uint flags);
    [DllImport("winmm.dll")] private static extern uint waveInPrepareHeader(IntPtr device,IntPtr header,uint size);
    [DllImport("winmm.dll")] private static extern uint waveInUnprepareHeader(IntPtr device,IntPtr header,uint size);
    [DllImport("winmm.dll")] private static extern uint waveInAddBuffer(IntPtr device,IntPtr header,uint size);
    [DllImport("winmm.dll")] private static extern uint waveInStart(IntPtr device);
    [DllImport("winmm.dll")] private static extern uint waveInReset(IntPtr device);
    [DllImport("winmm.dll")] private static extern uint waveInClose(IntPtr device);
    private readonly AutoResetEvent ready=new(false),stop=new(false);
    private int disposed;
    public Task<byte[]> Completion { get; }
    public MicrophoneCapture() { Completion=Task.Run(Record); }
    public Task<byte[]> StopAsync() { if(Volatile.Read(ref disposed)==0)stop.Set();return Completion; }
    private static void Ensure(uint code) { if(code!=0)throw new InvalidOperationException("麦克风暂不可用，请检查录音设备和Windows麦克风权限，或导入WAV音频。"); }
    private byte[] Record()
    {
        IntPtr device=IntPtr.Zero;List<(IntPtr Header,IntPtr Data)> buffers=[];uint size=(uint)Marshal.SizeOf<Header>();
        try
        {
            if(stop.WaitOne(0))throw new OperationCanceledException();
            var format=new Format {Tag=1,Channels=1,Rate=16000,ByteRate=32000,Align=2,Bits=16};Ensure(waveInOpen(out device,uint.MaxValue,ref format,ready.SafeWaitHandle.DangerousGetHandle(),IntPtr.Zero,0x50000|0x10));
            if(stop.WaitOne(0))throw new OperationCanceledException();
            for(int i=0;i<3;i++)
            {
                IntPtr data=Marshal.AllocHGlobal(8000),header=Marshal.AllocHGlobal((int)size);buffers.Add((header,data));Marshal.StructureToPtr(new Header {Data=data,Length=8000},header,false);Ensure(waveInPrepareHeader(device,header,size));Ensure(waveInAddBuffer(device,header,size));
            }
            Ensure(waveInStart(device));using var pcm=new MemoryStream();var started=System.Diagnostics.Stopwatch.StartNew();bool finished=false;
            void Collect(bool requeue)
            {
                foreach(var buffer in buffers)
                {
                    var h=Marshal.PtrToStructure<Header>(buffer.Header);if((h.Flags&1)==0)continue;
                    int count=(int)Math.Min(h.Recorded,3_840_000-pcm.Length);if(count>0){byte[] bytes=new byte[count];Marshal.Copy(h.Data,bytes,0,count);pcm.Write(bytes);}
                    h.Recorded=0;Marshal.StructureToPtr(h,buffer.Header,false);
                    if(requeue && pcm.Length<3_840_000)Ensure(waveInAddBuffer(device,buffer.Header,size));
                }
            }
            while(!finished)
            {
                int signal=WaitHandle.WaitAny([ready,stop],250);finished=signal==1 || stop.WaitOne(0) || started.Elapsed.TotalSeconds>=120 || pcm.Length>=3_840_000;
                if(!finished)Collect(true);
            }
            Ensure(waveInReset(device));Collect(false);return AudioClip.Wave(pcm.ToArray());
        }
        finally
        {
            if(device!=IntPtr.Zero)waveInReset(device);
            foreach(var buffer in buffers)
            {
                var h=Marshal.PtrToStructure<Header>(buffer.Header);
                if(device==IntPtr.Zero || (h.Flags&2)==0 || waveInUnprepareHeader(device,buffer.Header,size)==0){Marshal.FreeHGlobal(buffer.Data);Marshal.FreeHGlobal(buffer.Header);}
            }
            if(device!=IntPtr.Zero)waveInClose(device);
        }
    }
    public void Dispose()
    {
        if(Interlocked.Exchange(ref disposed,1)!=0)return;stop.Set();
        _=Completion.ContinueWith(task=>{_ = task.Exception;ready.Dispose();stop.Dispose();},CancellationToken.None,TaskContinuationOptions.ExecuteSynchronously,TaskScheduler.Default);
    }
}
