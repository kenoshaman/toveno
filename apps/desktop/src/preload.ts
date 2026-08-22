import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("toveno", {
  getAppUrl() {
    return ipcRenderer.invoke("get-app-url");
  },
  getDesktopSources() {
    return ipcRenderer.invoke("get-desktop-sources");
  },
  getSourceProcessInfo(sourceId: string, sourceName: string) {
    return ipcRenderer.invoke("get-source-process-info", sourceId, sourceName);
  },
  onSessionSelected(callback: (sessionId: string) => void) {
    ipcRenderer.on("session-selected", (_event, sessionId: string) => {
      callback(sessionId);
    });
  },
  openExternal(url: string) {
    return ipcRenderer.invoke("open-external", url);
  },
  setCaptureSource(sourceId: string, captureAudio: boolean) {
    return ipcRenderer.invoke("set-capture-source", sourceId, captureAudio);
  },
  startSystemAudio(processId?: number | null) {
    return ipcRenderer.invoke("start-system-audio", processId);
  },
  stopSystemAudio() {
    return ipcRenderer.invoke("stop-system-audio");
  },
  onSystemAudioLine(callback: (line: string) => void) {
    ipcRenderer.on("system-audio-line", (_event, line: string) => {
      callback(line);
    });
  },
  onSystemAudioStatus(callback: (message: string) => void) {
    ipcRenderer.on("system-audio-status", (_event, message: string) => {
      callback(message);
    });
  },
});
