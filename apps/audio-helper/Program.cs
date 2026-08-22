using System.Text.Json;
using NAudio.CoreAudioApi;
using NAudio.Wave;

if (args.Length == 0 || args[0] is "help" or "--help" or "-h")
{
    PrintHelp();
    return;
}

try
{
    switch (args[0])
    {
        case "devices":
            PrintDevices();
            break;
        case "record":
            await RecordLoopback(args);
            break;
        case "stream":
            await StreamLoopback();
            break;
        default:
            Console.Error.WriteLine($"Unknown command: {args[0]}");
            PrintHelp();
            Environment.ExitCode = 1;
            break;
    }
}
catch (Exception error)
{
    Console.Error.WriteLine(error);
    Environment.ExitCode = 1;
}

static void PrintHelp()
{
    Console.WriteLine("ToVeno.AudioHelper");
    Console.WriteLine("commands:");
    Console.WriteLine("  devices");
    Console.WriteLine("  record --seconds 5 --out audio-test.wav");
    Console.WriteLine("  stream [--pid 1234]");
}

static async Task StreamLoopback()
{
    var targetProcessId = GetIntArg(Environment.GetCommandLineArgs(), "--pid", 0);
    var builder = new WasapiRecorderBuilder().WithBufferLength(40);

    if (targetProcessId > 0)
    {
        if (!OperatingSystem.IsWindowsVersionAtLeast(10, 0, 19041))
        {
            throw new NotSupportedException("Process loopback requires Windows 10 build 19041 or newer.");
        }

        builder.WithProcessLoopback(
            (uint)targetProcessId,
            ProcessLoopbackMode.IncludeTargetProcessTree
        );
    }
    else
    {
        builder.WithLoopbackCapture();
    }

    await using var recorder = targetProcessId > 0
        ? await builder.BuildAsync()
        : builder.Build();

    var completion = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
    var cancellation = new CancellationTokenSource();

    Console.WriteLine(JsonSerializer.Serialize(new
    {
        type = "format",
        sampleRate = recorder.WaveFormat.SampleRate,
        channels = recorder.WaveFormat.Channels,
        bitsPerSample = 16,
        device = targetProcessId > 0 ? $"process:{targetProcessId}" : "default-output",
        processId = targetProcessId > 0 ? (int?)targetProcessId : null,
    }));

    recorder.RecordingStopped += (_, eventArgs) =>
    {
        if (eventArgs.Exception is not null)
        {
            completion.TrySetException(eventArgs.Exception);
            return;
        }

        completion.TrySetResult();
    };

    Console.CancelKeyPress += (_, eventArgs) =>
    {
        eventArgs.Cancel = true;
        cancellation.Cancel();
    };

    recorder.DataAvailable += (buffer, _, _, _) =>
    {
        var pcm16 = ConvertToPcm16(buffer.ToArray(), buffer.Length, recorder.WaveFormat);

        if (pcm16.Length > 0)
        {
            Console.WriteLine(JsonSerializer.Serialize(new
            {
                type = "audio",
                data = Convert.ToBase64String(pcm16),
            }));
        }
    };

    recorder.StartRecording();

    try
    {
        while (!cancellation.IsCancellationRequested)
        {
            await Task.Delay(100, cancellation.Token);
        }
    }
    catch (OperationCanceledException)
    {
        // Normal shutdown.
    }
    finally
    {
        recorder.StopRecording();
        await completion.Task;
    }
}

static byte[] ConvertToPcm16(byte[] input, int bytesRecorded, WaveFormat format)
{
    if (format.Encoding == WaveFormatEncoding.Pcm && format.BitsPerSample == 16)
    {
        var copy = new byte[bytesRecorded];
        Buffer.BlockCopy(input, 0, copy, 0, bytesRecorded);
        return copy;
    }

    if (format.Encoding == WaveFormatEncoding.IeeeFloat && format.BitsPerSample == 32)
    {
        var sampleCount = bytesRecorded / 4;
        var output = new byte[sampleCount * 2];

        for (var index = 0; index < sampleCount; index++)
        {
            var sample = BitConverter.ToSingle(input, index * 4);
            sample = Math.Clamp(sample, -1f, 1f);
            var pcm = (short)Math.Round(sample * short.MaxValue);
            var outputIndex = index * 2;
            output[outputIndex] = (byte)(pcm & 0xff);
            output[outputIndex + 1] = (byte)((pcm >> 8) & 0xff);
        }

        return output;
    }

    return [];
}

static void PrintDevices()
{
    using var enumerator = new MMDeviceEnumerator();
    var devices = enumerator
        .EnumerateAudioEndPoints(DataFlow.Render, DeviceState.Active)
        .Select(device => new
        {
            id = device.ID,
            name = device.FriendlyName,
            state = device.State.ToString(),
            isDefault = device.ID == enumerator.GetDefaultAudioEndpoint(DataFlow.Render, Role.Multimedia).ID,
        })
        .ToArray();

    Console.WriteLine(JsonSerializer.Serialize(devices, new JsonSerializerOptions
    {
        WriteIndented = true,
    }));
}

static async Task RecordLoopback(string[] args)
{
    var seconds = GetIntArg(args, "--seconds", 5);
    var outputPath = GetStringArg(args, "--out", "audio-test.wav");

    using var enumerator = new MMDeviceEnumerator();
    using var device = enumerator.GetDefaultAudioEndpoint(DataFlow.Render, Role.Multimedia);
    using var capture = new WasapiLoopbackCapture(device);
    await using var writer = new WaveFileWriter(outputPath, capture.WaveFormat);

    var completion = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
    var bytesWritten = 0L;

    capture.DataAvailable += (_, eventArgs) =>
    {
        writer.Write(eventArgs.Buffer, 0, eventArgs.BytesRecorded);
        bytesWritten += eventArgs.BytesRecorded;
    };

    capture.RecordingStopped += (_, eventArgs) =>
    {
        if (eventArgs.Exception is not null)
        {
            completion.TrySetException(eventArgs.Exception);
            return;
        }

        completion.TrySetResult();
    };

    Console.WriteLine($"Recording default output device: {device.FriendlyName}");
    Console.WriteLine($"Output: {Path.GetFullPath(outputPath)}");

    capture.StartRecording();
    await Task.Delay(TimeSpan.FromSeconds(seconds));
    capture.StopRecording();
    await completion.Task;

    Console.WriteLine($"Done. Bytes written: {bytesWritten}");
}

static int GetIntArg(string[] args, string name, int fallback)
{
    var value = GetStringArg(args, name, null);
    return int.TryParse(value, out var parsed) ? parsed : fallback;
}

static string GetStringArg(string[] args, string name, string? fallback)
{
    var index = Array.IndexOf(args, name);

    if (index < 0 || index + 1 >= args.Length)
    {
        return fallback ?? "";
    }

    return args[index + 1];
}
