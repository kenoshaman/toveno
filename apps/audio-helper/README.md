# ToVeno Audio Helper

Windows audio helper used to test native WASAPI loopback outside Electron/Chromium.

Commands:

```powershell
dotnet run --project apps/audio-helper -- devices
dotnet run --project apps/audio-helper -- record --seconds 5 --out audio-test.wav
```
