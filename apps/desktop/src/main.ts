import electron = require("electron");
import type { BrowserWindow as BrowserWindowType } from "electron";
import { config } from "dotenv";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";

config({ path: path.resolve(__dirname, "../../../.env") });

const { app, BrowserWindow, desktopCapturer, ipcMain, session, shell } = electron;
let mainWindow: BrowserWindowType | null = null;
let pendingSessionId: string | null = null;
let runtimeAppUrl: string | null = null;
let selectedSourceId: string | null = null;
let shouldCaptureAudio = true;
let audioHelper: ChildProcess | null = null;
let audioHelperStopping = false;

type DesktopSourceDto = {
  id: string;
  name: string;
  thumbnail: string;
  appIcon: string | null;
};

type ProcessInfoDto = {
  processId: number | null;
  audioProcessId: number | null;
  processName: string | null;
};

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1040,
    height: 720,
    minWidth: 860,
    minHeight: 560,
    backgroundColor: "#101418",
    title: "ToVeno Desktop",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, "../renderer/index.html"));

  mainWindow.webContents.once("did-finish-load", () => {
    if (pendingSessionId) {
      mainWindow?.webContents.send("session-selected", pendingSessionId);
    }
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function focusWindow(launchParams?: LaunchParams) {
  if (launchParams?.sessionId) {
    pendingSessionId = launchParams.sessionId;
  }

  if (launchParams?.appUrl) {
    runtimeAppUrl = launchParams.appUrl;
  }

  if (!mainWindow) {
    createWindow();
    return;
  }

  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }

  mainWindow.focus();

  if (launchParams?.sessionId) {
    mainWindow.webContents.send("session-selected", launchParams.sessionId);
  }
}

type LaunchParams = {
  appUrl: string | null;
  sessionId: string | null;
};

function getLaunchParamsFromUrl(rawUrl: string): LaunchParams {
  try {
    const parsedUrl = new URL(rawUrl);
    const sessionId =
      parsedUrl.hostname.toLowerCase() === "transmit"
        ? parsedUrl.pathname.replace(/^\//, "")
        : parsedUrl.pathname.split("/").filter(Boolean)[0] ?? "";

    return {
      appUrl: parsedUrl.searchParams.get("appUrl"),
      sessionId: sessionId ? decodeURIComponent(sessionId) : null,
    };
  } catch {
    const match = rawUrl.match(/^toveno:\/\/transmit\/([^/?#]+)/i);

    return {
      appUrl: null,
      sessionId: match?.[1] ? decodeURIComponent(match[1]) : null,
    };
  }
}

const gotLock = app.requestSingleInstanceLock();

if (!gotLock) {
  app.quit();
}

app.on("second-instance", (_event, argv) => {
  const protocolUrl = argv.find((arg) => arg.startsWith("toveno://"));
  focusWindow(protocolUrl ? getLaunchParamsFromUrl(protocolUrl) : undefined);
});

app.whenReady().then(() => {
  session.defaultSession.setDisplayMediaRequestHandler((_request, callback) => {
    desktopCapturer
      .getSources({
        types: ["screen", "window"],
        thumbnailSize: {
          width: 0,
          height: 0,
        },
      })
      .then((sources) => {
        const source =
          sources.find((candidate) => candidate.id === selectedSourceId) ??
          sources[0];

        if (!source) {
          callback({});
          return;
        }

        callback({
          audio: shouldCaptureAudio ? "loopback" : undefined,
          video: source,
        });
      })
      .catch(() => {
        callback({});
      });
  });

  if (process.defaultApp) {
    app.setAsDefaultProtocolClient("toveno", process.execPath, [
      path.resolve(process.argv[1] ?? ""),
    ]);
  } else {
    app.setAsDefaultProtocolClient("toveno");
  }

  const protocolUrl = process.argv.find((arg) => arg.startsWith("toveno://"));
  const launchParams = protocolUrl ? getLaunchParamsFromUrl(protocolUrl) : null;
  pendingSessionId = launchParams?.sessionId ?? null;
  runtimeAppUrl = launchParams?.appUrl ?? null;
  createWindow();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

ipcMain.handle("open-external", async (_event, url: string) => {
  await shell.openExternal(url);
});

ipcMain.handle("get-app-url", () => {
  return getConfiguredAppUrl();
});

ipcMain.handle(
  "set-capture-source",
  (_event, sourceId: string, captureAudio: boolean) => {
    selectedSourceId = sourceId;
    shouldCaptureAudio = captureAudio;
  },
);

ipcMain.handle("start-system-audio", (_event, processId?: number | null) => {
  if (audioHelper) {
    return;
  }

  const projectRoot = path.resolve(__dirname, "../../..");
  const packagedHelperPath = path.join(
    process.resourcesPath,
    "audio-helper",
    "ToVeno.AudioHelper.exe",
  );
  const windowsDotnet = "C:\\Program Files\\dotnet\\dotnet.exe";
  const hasPackagedHelper = app.isPackaged && fs.existsSync(packagedHelperPath);
  const dotnetCommand =
    process.platform === "win32" && fs.existsSync(windowsDotnet)
      ? windowsDotnet
      : "dotnet";

  const mode =
    processId && processId > 0 ? `processo ${processId}` : "áudio geral do Windows";

  mainWindow?.webContents.send(
    "system-audio-status",
    `Abrindo helper de áudio (${mode}): ${
      hasPackagedHelper ? packagedHelperPath : dotnetCommand
    }`,
  );

  const helperCommand = hasPackagedHelper ? packagedHelperPath : dotnetCommand;
  const helperArgs = hasPackagedHelper
    ? ["stream"]
    : [
        "run",
        "--no-build",
        "--project",
        path.join(projectRoot, "apps/audio-helper"),
        "--",
        "stream",
      ];

  if (processId && processId > 0) {
    helperArgs.push("--pid", String(processId));
  }

  audioHelper = spawn(helperCommand, helperArgs, {
    cwd: hasPackagedHelper ? path.dirname(packagedHelperPath) : projectRoot,
    stdio: ["ignore", "pipe", "pipe"],
  });

  const helper = audioHelper;

  helper.on("error", (error) => {
    audioHelper = null;
    mainWindow?.webContents.send(
      "system-audio-status",
      `Falha ao abrir helper de áudio: ${error.message}`,
    );
  });

  if (!helper.stdout || !helper.stderr) {
    audioHelper = null;
    mainWindow?.webContents.send(
      "system-audio-status",
      "Helper de áudio abriu sem stdout/stderr.",
    );
    return;
  }

  const output = readline.createInterface({
    input: helper.stdout,
    crlfDelay: Infinity,
  });

  output.on("line", (line) => {
    mainWindow?.webContents.send("system-audio-line", line);
  });

  helper.stderr.on("data", (data) => {
    const message = String(data).trim();
    console.error(`[audio-helper] ${message}`);
    if (message) {
      mainWindow?.webContents.send("system-audio-status", message);
    }
  });

  helper.on("exit", (code) => {
    audioHelper = null;
    if (!audioHelperStopping) {
      mainWindow?.webContents.send(
        "system-audio-status",
        `Helper de áudio encerrou inesperadamente. Código: ${
          code ?? "sem código"
        }`,
      );
    }
    audioHelperStopping = false;
    mainWindow?.webContents.send("system-audio-stopped");
  });
});

ipcMain.handle("stop-system-audio", () => {
  audioHelperStopping = true;
  audioHelper?.kill();
  audioHelper = null;
});

ipcMain.handle("get-desktop-sources", async () => {
  const sources = await desktopCapturer.getSources({
    fetchWindowIcons: true,
    thumbnailSize: {
      width: 320,
      height: 180,
    },
    types: ["screen", "window"],
  });

  const mappedSources: DesktopSourceDto[] = sources.map((source) => ({
    id: source.id,
    name: source.name,
    thumbnail: source.thumbnail.toDataURL(),
    appIcon: source.appIcon?.isEmpty() ? null : source.appIcon?.toDataURL(),
  }));

  return mappedSources;
});

ipcMain.handle(
  "get-source-process-info",
  (_event, sourceId: string, sourceName: string): ProcessInfoDto => {
    const processInfo = getProcessInfoFromDesktopSource(sourceId, sourceName);

    return {
      processId: processInfo?.processId ?? null,
      audioProcessId: processInfo?.audioProcessId ?? null,
      processName: processInfo?.processName ?? null,
    };
  },
);

function getProcessInfoFromDesktopSource(sourceId: string, sourceName: string) {
  const match = sourceId.match(/^window:(\d+):/);

  if (match?.[1]) {
    const processInfo = getProcessInfoFromWindowHandle(match[1]);

    if (processInfo?.audioProcessId) {
      return processInfo;
    }
  }

  return getProcessInfoFromWindowTitle(sourceName);
}

function getProcessInfoFromWindowHandle(windowHandle: string) {
  const script = `
$Handle = $env:TOVENO_PS_ARG_0
Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class Win32Window {
  [DllImport("user32.dll")]
  public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint targetProcessId);
}
"@
$targetProcessId = 0
$threadId = [Win32Window]::GetWindowThreadProcessId([IntPtr]([long]$Handle), [ref]$targetProcessId)
if ($threadId -eq 0) { exit 1 }
$process = Get-CimInstance Win32_Process -Filter "ProcessId=$targetProcessId"
if (-not $process) { exit 1 }
$root = $process
while ($root.ParentProcessId) {
  $parent = Get-CimInstance Win32_Process -Filter "ProcessId=$($root.ParentProcessId)"
  if (-not $parent -or $parent.Name -ne $root.Name) { break }
  $root = $parent
}
[Console]::Write(($root | Select-Object @{Name='processId';Expression={$process.ProcessId}}, @{Name='audioProcessId';Expression={$root.ProcessId}}, @{Name='processName';Expression={$process.Name}} | ConvertTo-Json -Compress))
`;

  try {
    const output = spawnSyncPowerShell(script, [windowHandle]);
    const parsed = JSON.parse(output) as {
      processId?: number;
      audioProcessId?: number;
      processName?: string;
    };

    return {
      processId:
        typeof parsed.processId === "number" && parsed.processId > 0
          ? parsed.processId
          : null,
      audioProcessId:
        typeof parsed.audioProcessId === "number" && parsed.audioProcessId > 0
          ? parsed.audioProcessId
          : null,
      processName:
        typeof parsed.processName === "string" ? parsed.processName : null,
    };
  } catch {
    return null;
  }
}

function getProcessInfoFromWindowTitle(sourceName: string) {
  const script = `
$SourceName = $env:TOVENO_PS_ARG_0
$candidates = @(
  $SourceName,
  ($SourceName -replace '\\s+-\\s+Google Chrome$', ''),
  ($SourceName -replace '\\s+-\\s+Visual Studio Code$', ''),
  ($SourceName -replace '\\s+-\\s+Discord$', '')
) | Where-Object { $_ -and $_.Trim().Length -gt 0 } | ForEach-Object { $_.Trim() } | Select-Object -Unique

$processes = Get-Process | Where-Object { $_.MainWindowTitle }
$process = $null

foreach ($candidate in $candidates) {
  $process = $processes |
    Where-Object { $_.MainWindowTitle.Equals($candidate, [StringComparison]::OrdinalIgnoreCase) } |
    Select-Object -First 1
  if ($process) { break }
}

foreach ($candidate in $candidates) {
  if ($process) { break }
  $process = $processes |
    Where-Object {
      $_.MainWindowTitle.IndexOf($candidate, [StringComparison]::OrdinalIgnoreCase) -ge 0 -or
      $candidate.IndexOf($_.MainWindowTitle, [StringComparison]::OrdinalIgnoreCase) -ge 0
    } |
    Select-Object -First 1
}

if (-not $process -and $SourceName -match 'Google Chrome$') {
  $process = $processes |
    Where-Object { $_.ProcessName -eq 'chrome' } |
    Select-Object -First 1
}

if (-not $process -and $SourceName -match 'Visual Studio Code$') {
  $process = $processes |
    Where-Object { $_.ProcessName -eq 'Code' } |
    Select-Object -First 1
}

if (-not $process -and $SourceName -match 'Discord$') {
  $process = $processes |
    Where-Object { $_.ProcessName -eq 'Discord' } |
    Select-Object -First 1
}

if (-not $process) { exit 1 }
$root = Get-CimInstance Win32_Process -Filter "ProcessId=$($process.Id)"
if (-not $root) { exit 1 }
while ($root.ParentProcessId) {
  $parent = Get-CimInstance Win32_Process -Filter "ProcessId=$($root.ParentProcessId)"
  if (-not $parent -or $parent.Name -ne $root.Name) { break }
  $root = $parent
}
[Console]::Write(($root | Select-Object @{Name='processId';Expression={$process.Id}}, @{Name='audioProcessId';Expression={$root.ProcessId}}, @{Name='processName';Expression={$process.ProcessName + '.exe'}} | ConvertTo-Json -Compress))
`;

  try {
    const output = spawnSyncPowerShell(script, [sourceName]);
    const parsed = JSON.parse(output) as {
      processId?: number;
      audioProcessId?: number;
      processName?: string;
    };

    return {
      processId:
        typeof parsed.processId === "number" && parsed.processId > 0
          ? parsed.processId
          : null,
      audioProcessId:
        typeof parsed.audioProcessId === "number" && parsed.audioProcessId > 0
          ? parsed.audioProcessId
          : null,
      processName:
        typeof parsed.processName === "string" ? parsed.processName : null,
    };
  } catch {
    return null;
  }
}

function spawnSyncPowerShell(script: string, args: string[]) {
  const encodedScript = Buffer.from(script, "utf16le").toString("base64");
  const result = spawnSync(
    "powershell",
    [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-EncodedCommand",
      encodedScript,
    ],
    {
      encoding: "utf8",
      env: {
        ...process.env,
        TOVENO_PS_ARG_0: args[0] ?? "",
      },
      windowsHide: true,
    },
  );

  if (result.status !== 0) {
    throw new Error(result.stderr || "PowerShell command failed.");
  }

  return result.stdout.trim();
}

function getConfiguredAppUrl() {
  if (runtimeAppUrl) {
    return runtimeAppUrl;
  }

  if (process.env.APP_URL) {
    return process.env.APP_URL;
  }

  const packagedConfigPath = path.join(process.resourcesPath, "app.asar", "build", "app-url.txt");
  const unpackedConfigPath = path.join(__dirname, "../build/app-url.txt");

  for (const configPath of [packagedConfigPath, unpackedConfigPath]) {
    try {
      const appUrl = fs.readFileSync(configPath, "utf8").trim();

      if (appUrl) {
        return appUrl;
      }
    } catch {
      // Config file is optional in development.
    }
  }

  return "http://localhost:3000";
}
