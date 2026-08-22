import { LocalAudioTrack, LocalVideoTrack, Room, RoomEvent } from "livekit-client";

type DesktopSource = {
  id: string;
  name: string;
  thumbnail: string;
  appIcon: string | null;
};

type SourceProcessInfo = {
  processId: number | null;
  audioProcessId: number | null;
  processName: string | null;
};

type BandwidthProfileKey = "humble" | "bold";
type QualityKey = "p480" | "p720" | "p1080";

type QualityPreset = {
  label: string;
  width: number;
  height: number;
  bitrates: Record<BandwidthProfileKey, number>;
};

const qualityPresets: Record<QualityKey, QualityPreset> = {
  p480: {
    label: "480p",
    width: 854,
    height: 480,
    bitrates: {
      humble: 2_500_000,
      bold: 3_000_000,
    },
  },
  p720: {
    label: "720p",
    width: 1280,
    height: 720,
    bitrates: {
      humble: 7_000_000,
      bold: 9_000_000,
    },
  },
  p1080: {
    label: "1080p",
    width: 1920,
    height: 1080,
    bitrates: {
      humble: 14_000_000,
      bold: 18_000_000,
    },
  },
};

declare global {
  interface Window {
    toveno?: {
      getAppUrl(): Promise<string>;
      getDesktopSources(): Promise<DesktopSource[]>;
      getSourceProcessInfo(
        sourceId: string,
        sourceName: string,
      ): Promise<SourceProcessInfo>;
      onSessionSelected(callback: (sessionId: string) => void): void;
      onSystemAudioLine(callback: (line: string) => void): void;
      onSystemAudioStatus(callback: (message: string) => void): void;
      openExternal(url: string): Promise<void>;
      setCaptureSource(sourceId: string, captureAudio: boolean): Promise<void>;
      startSystemAudio(processId?: number | null): Promise<void>;
      stopSystemAudio(): Promise<void>;
    };
  }
}

const sessionPill = getElement<HTMLSpanElement>("#session-pill");
const status = getElement<HTMLParagraphElement>("#status");
const openWebButton = getElement<HTMLButtonElement>("#open-web");
const startPreviewButton = getElement<HTMLButtonElement>("#start-preview");
const startBroadcastButton = getElement<HTMLButtonElement>("#start-broadcast");
const stopButton = getElement<HTMLButtonElement>("#stop-capture");
const captureAudioInput = getElement<HTMLInputElement>("#capture-audio");
const showPreviewInput = getElement<HTMLInputElement>("#show-preview");
const bandwidthProfileSelect = getElement<HTMLSelectElement>("#bandwidth-profile-select");
const qualitySelect = getElement<HTMLSelectElement>("#quality-select");
const fpsSelect = getElement<HTMLSelectElement>("#fps-select");
const refreshSourcesButton = getElement<HTMLButtonElement>("#refresh-sources");
const sourcesGrid = getElement<HTMLDivElement>("#sources-grid");
const selectedSource = getElement<HTMLSpanElement>("#selected-source");
const diagnostics = getElement<HTMLSpanElement>("#diagnostics");
const previewVideo = getElement<HTMLVideoElement>("#preview-video");
const emptyState = getElement<HTMLDivElement>("#empty-state");

let appUrl = "http://localhost:3000";
let currentSessionId = "";
let currentSourceId = "";
let currentSourceName = "";
let currentSourceProcessId: number | null = null;
let currentSourceAudioProcessId: number | null = null;
let currentSourceProcessName: string | null = null;
let currentSourceProcessResolved = false;
let previewStream: MediaStream | null = null;
let room: Room | null = null;
let publishedVideoTrack: LocalVideoTrack | null = null;
let publishedAudioTrack: LocalAudioTrack | null = null;
let systemAudio: SystemAudioBridge | null = null;
let statusPrefix = "";
let statsInterval: number | null = null;
let previousStats: StatsSample | null = null;
let captureStatsVideo: HTMLVideoElement | null = null;
let captureStatsFrameCount = 0;
let captureStatsStartedAt = 0;
let captureStatsAnimation = 0;
let captureDiagnosticsText = "Captura real: aguardando.";
let outboundDiagnosticsText = "Envio real: aguardando.";

window.toveno?.onSystemAudioLine((line) => {
  systemAudio?.handleLine(line);
});

window.toveno?.onSystemAudioStatus((message) => {
  status.textContent = `${statusPrefix}Áudio: ${message}`;
});

window.toveno?.onSessionSelected((sessionId) => {
  currentSessionId = sessionId;
  sessionPill.textContent = sessionId;
  status.textContent = "Sessão recebida. Escolha uma fonte e inicie a transmissão.";
});

openWebButton.addEventListener("click", () => {
  if (!currentSessionId) {
    status.textContent = "Abra o app por uma sessão do Discord antes.";
    return;
  }

  void window.toveno?.openExternal(`${appUrl}/transmit/${currentSessionId}`);
});

startPreviewButton.addEventListener("click", () => {
  void startPreview();
});

startBroadcastButton.addEventListener("click", () => {
  void startBroadcast();
});

stopButton.addEventListener("click", () => {
  void stopCapture();
});

refreshSourcesButton.addEventListener("click", () => {
  void loadSources();
});

async function startPreview() {
  if (!currentSourceId) {
    status.textContent = "Escolha uma janela ou tela antes de iniciar.";
    return;
  }

  await stopCapture();
  showPreviewInput.checked = true;
  status.textContent = "Iniciando prévia...";

  try {
    const capture = await createDesktopStreamWithFallback(
      currentSourceId,
      captureAudioInput.checked,
      getTransmissionSettings(),
    );
    previewStream = capture.stream;
    startCaptureDiagnostics(previewStream);
    setPreviewStream(previewStream);
    setCaptureButtons("preview");
    status.textContent = `Prévia ativa: ${currentSourceName}. Áudio ${
      capture.audioEnabled ? "ativo" : "indisponível"
    }.`;
  } catch (error) {
    status.textContent = "Não foi possível iniciar a prévia desta fonte.";
    console.error(error);
  }
}

async function startBroadcast() {
  if (!currentSessionId) {
    status.textContent = "Abra o app pelo botão Abrir ToVeno de uma sessão do Discord.";
    return;
  }

  if (!currentSourceId) {
    status.textContent = "Escolha uma janela ou tela antes de transmitir.";
    return;
  }

  await stopCapture();
  status.textContent = "Conectando ao LiveKit...";

  try {
    const capture = await createDesktopStreamWithFallback(
      currentSourceId,
      captureAudioInput.checked,
      getTransmissionSettings(),
    );
    previewStream = capture.stream;
    startCaptureDiagnostics(previewStream);
    setPreviewStream(previewStream);

    let audioTrack: MediaStreamTrack | null = null;

    if (captureAudioInput.checked) {
      try {
        await resolveCurrentSourceProcess();
        systemAudio = new SystemAudioBridge();
        audioTrack = await systemAudio.start();
        await window.toveno?.startSystemAudio(currentSourceAudioProcessId);
        status.textContent = "Áudio: aguardando primeiro pacote do helper...";
        await systemAudio.waitForFirstAudioPacket(4500);
      } catch (audioError) {
        console.error("Audio capture failed. Continuing with video only.", audioError);
        await window.toveno?.stopSystemAudio();
        await systemAudio?.stop();
        systemAudio = null;
        audioTrack?.stop();
        audioTrack = null;
        status.textContent =
          "Áudio indisponível nesta fonte. Continuando transmissão somente com vídeo.";
      }
    }

    const { token, url } = await createLiveKitToken(currentSessionId);
    room = new Room();
    room
      .on(RoomEvent.Reconnecting, () => {
        status.textContent = "Reconectando ao LiveKit...";
      })
      .on(RoomEvent.Reconnected, () => {
        status.textContent = "Reconectado ao LiveKit.";
      })
      .on(RoomEvent.Disconnected, (reason) => {
        status.textContent = `Desconectado do LiveKit: ${reason ?? "sem motivo informado"}.`;
      })
      .on(RoomEvent.LocalTrackPublished, (publication) => {
        status.textContent = `Faixa publicada: ${publication.source}.`;
      });
    await room.connect(url, token);

    const mediaTrack = previewStream.getVideoTracks()[0];

    if (!mediaTrack) {
      throw new Error("Desktop stream did not include a video track.");
    }

    if (audioTrack) {
      publishedAudioTrack = new LocalAudioTrack(audioTrack);
      await room.localParticipant.publishTrack(publishedAudioTrack, {
        name: "desktop-audio",
        source: "screen_share_audio",
      });
    }

    publishedVideoTrack = new LocalVideoTrack(mediaTrack);
    const settings = getTransmissionSettings();
    await room.localParticipant.publishTrack(publishedVideoTrack, {
      name: "desktop-screen",
      source: "screen_share",
      simulcast: false,
      screenShareEncoding: {
        maxBitrate: settings.bitrate,
        maxFramerate: settings.fps,
      },
    });
    startOutboundDiagnostics(publishedVideoTrack);

    setCaptureButtons("broadcast");
    statusPrefix = `Transmitindo pelo desktop: ${currentSourceName}. `;
    status.textContent = `Transmitindo pelo desktop: ${currentSourceName}. ${
      settings.quality.label
    } / ${settings.fps} FPS / ${formatBitrate(settings.bitrate)}. Áudio ${
      audioTrack ? "ativo" : "indisponível"
    }.`;
  } catch (error) {
    statusPrefix = "";
    status.textContent = "Não foi possível iniciar a transmissão desktop.";
    console.error(error);
    await stopCapture();
  }
}

async function stopCapture() {
  if (publishedVideoTrack && room) {
    await room.localParticipant.unpublishTrack(publishedVideoTrack);
  }

  if (publishedAudioTrack && room) {
    await room.localParticipant.unpublishTrack(publishedAudioTrack);
  }

  publishedVideoTrack?.stop();
  publishedAudioTrack?.stop();
  publishedVideoTrack = null;
  publishedAudioTrack = null;
  stopOutboundDiagnostics();
  room?.disconnect();
  room = null;
  statusPrefix = "";
  await window.toveno?.stopSystemAudio();
  await systemAudio?.stop();
  systemAudio = null;

  if (previewStream) {
    previewStream.getTracks().forEach((track) => track.stop());
  }

  previewStream = null;
  stopCaptureDiagnostics();
  setPreviewStream(null);
  setCaptureButtons("idle");
}

async function loadSources() {
  sourcesGrid.innerHTML = '<p class="empty-list">Carregando fontes...</p>';

  try {
    const sources = await window.toveno?.getDesktopSources();

    if (!sources?.length) {
      sourcesGrid.innerHTML = '<p class="empty-list">Nenhuma janela ou tela encontrada.</p>';
      return;
    }

    sourcesGrid.replaceChildren(
      ...sources.map((source) => createSourceButton(source)),
    );
  } catch {
    sourcesGrid.innerHTML =
      '<p class="empty-list error">Não foi possível listar janelas e telas.</p>';
  }
}

function createSourceButton(source: DesktopSource) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "source-card";
  button.dataset.sourceId = source.id;

  const thumbnail = document.createElement("img");
  thumbnail.className = "source-thumbnail";
  thumbnail.alt = "";
  thumbnail.src = source.thumbnail;

  const label = document.createElement("span");
  label.className = "source-label";
  label.textContent = source.name;

  button.append(thumbnail, label);

  button.addEventListener("click", () => {
    void stopCapture();
    currentSourceId = source.id;
    currentSourceName = source.name;
    currentSourceProcessId = null;
    currentSourceAudioProcessId = null;
    currentSourceProcessName = null;
    currentSourceProcessResolved = false;
    selectedSource.textContent = `Fonte selecionada: ${source.name}. Resolvendo áudio... ID: ${source.id}.`;
    void resolveCurrentSourceProcess();

    document.querySelectorAll(".source-card").forEach((card) => {
      card.classList.toggle("selected", card === button);
    });
  });

  return button;
}

async function resolveCurrentSourceProcess() {
  if (!currentSourceId || currentSourceProcessResolved) {
    return;
  }

  try {
    const processInfo = await window.toveno?.getSourceProcessInfo(
      currentSourceId,
      currentSourceName,
    );

    currentSourceProcessId = processInfo?.processId ?? null;
    currentSourceAudioProcessId = processInfo?.audioProcessId ?? null;
    currentSourceProcessName = processInfo?.processName ?? null;
    currentSourceProcessResolved = true;
  } catch {
    currentSourceProcessId = null;
    currentSourceAudioProcessId = null;
    currentSourceProcessName = null;
    currentSourceProcessResolved = true;
  }

  selectedSource.textContent = `Fonte selecionada: ${currentSourceName}. Áudio: ${
    currentSourceAudioProcessId
      ? `somente ${currentSourceProcessName ?? "processo"} ${currentSourceAudioProcessId}`
      : "áudio geral em telas inteiras"
  }. ID: ${currentSourceId}.`;
}

function setPreviewStream(stream: MediaStream | null) {
  if (!showPreviewInput.checked || !stream) {
    previewVideo.srcObject = null;
    emptyState.hidden = false;
    return;
  }

  previewVideo.srcObject = stream;
  emptyState.hidden = true;
}

async function createDesktopStream(
  sourceId: string,
  captureAudio: boolean,
  settings: TransmissionSettings,
) {
  await window.toveno?.setCaptureSource(sourceId, false);

  return navigator.mediaDevices.getDisplayMedia({
    audio: false,
    video: {
      frameRate: settings.fps,
      height: {
        ideal: settings.quality.height,
        max: settings.quality.height,
      },
      width: {
        ideal: settings.quality.width,
        max: settings.quality.width,
      },
    },
  });
}

class SystemAudioBridge {
  private audioContext: AudioContext | null = null;
  private destination: MediaStreamAudioDestinationNode | null = null;
  private nextStartTime = 0;
  private channels = 2;
  private sampleRate = 48000;
  private firstAudioResolve: (() => void) | null = null;
  private firstAudioReject: ((error: Error) => void) | null = null;
  private receivedAudioChunks = 0;
  private receivedAudibleChunks = 0;
  private loudestPeak = 0;

  async start(): Promise<MediaStreamTrack> {
    this.audioContext = new AudioContext({
      sampleRate: this.sampleRate,
    });
    await this.audioContext.resume();
    this.destination = this.audioContext.createMediaStreamDestination();
    this.nextStartTime = this.audioContext.currentTime + 0.12;

    const track = this.destination.stream.getAudioTracks()[0];

    if (!track) {
      throw new Error("Could not create system audio track.");
    }

    return track;
  }

  waitForFirstAudioPacket(timeoutMs: number) {
    if (this.receivedAudioChunks > 0) {
      return Promise.resolve();
    }

    return new Promise<void>((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        this.firstAudioResolve = null;
        this.firstAudioReject = null;
        reject(
          new Error(
            "O helper abriu, mas nenhum pacote de áudio chegou ao app desktop.",
          ),
        );
      }, timeoutMs);

      this.firstAudioResolve = () => {
        window.clearTimeout(timeout);
        resolve();
      };
      this.firstAudioReject = (error) => {
        window.clearTimeout(timeout);
        reject(error);
      };
    });
  }

  handleLine(line: string) {
    if (!this.audioContext || !this.destination) {
      return;
    }

    try {
      const message = JSON.parse(line) as
        | {
            type: "format";
            sampleRate: number;
            channels: number;
          }
        | {
            type: "audio";
            data: string;
          };

      if (message.type === "format") {
        this.sampleRate = message.sampleRate;
        this.channels = message.channels;
        return;
      }

      const peak = getPcm16Peak(message.data);
      this.receivedAudioChunks += 1;
      this.loudestPeak = Math.max(this.loudestPeak, peak);
      this.scheduleAudioChunk(message.data);
      this.firstAudioResolve?.();
      this.firstAudioResolve = null;
      this.firstAudioReject = null;

      if (peak > 0.002) {
        this.receivedAudibleChunks += 1;
      }
    } catch (error) {
      console.warn("Invalid audio helper message.", error);
    }
  }

  async stop() {
    await this.audioContext?.close();
    this.audioContext = null;
    this.destination = null;
  }

  private scheduleAudioChunk(base64Data: string) {
    if (!this.audioContext || !this.destination) {
      return;
    }

    if (this.audioContext.state === "suspended") {
      void this.audioContext.resume();
    }

    const bytes = base64ToUint8Array(base64Data);
    const sampleCount = Math.floor(bytes.byteLength / 2 / this.channels);

    if (sampleCount <= 0) {
      return;
    }

    const buffer = this.audioContext.createBuffer(
      this.channels,
      sampleCount,
      this.sampleRate,
    );
    const dataView = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

    for (let sampleIndex = 0; sampleIndex < sampleCount; sampleIndex += 1) {
      for (let channelIndex = 0; channelIndex < this.channels; channelIndex += 1) {
        const byteIndex = (sampleIndex * this.channels + channelIndex) * 2;
        const sample = dataView.getInt16(byteIndex, true) / 32768;
        buffer.getChannelData(channelIndex)[sampleIndex] = sample;
      }
    }

    const source = this.audioContext.createBufferSource();
    source.buffer = buffer;
    source.connect(this.destination);

    const startTime = Math.max(
      this.nextStartTime,
      this.audioContext.currentTime + 0.03,
    );
    source.start(startTime);
    this.nextStartTime = startTime + buffer.duration;
  }
}

function base64ToUint8Array(base64Data: string) {
  const binary = atob(base64Data);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

function getPcm16Peak(base64Data: string) {
  const bytes = base64ToUint8Array(base64Data);
  const dataView = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let peak = 0;

  for (let byteIndex = 0; byteIndex + 1 < bytes.byteLength; byteIndex += 2) {
    peak = Math.max(peak, Math.abs(dataView.getInt16(byteIndex, true) / 32768));
  }

  return peak;
}

async function createDesktopStreamWithFallback(
  sourceId: string,
  captureAudio: boolean,
  settings: TransmissionSettings,
): Promise<{ stream: MediaStream; audioEnabled: boolean }> {
  if (!captureAudio) {
    return {
      stream: await createDesktopStream(sourceId, false, settings),
      audioEnabled: false,
    };
  }

  try {
    const stream = await createDesktopStream(sourceId, true, settings);

    return {
      stream,
      audioEnabled: stream.getAudioTracks().length > 0,
    };
  } catch (error) {
    console.warn("Audio capture failed, retrying with video only.", error);

    return {
      stream: await createDesktopStream(sourceId, false, settings),
      audioEnabled: false,
    };
  }
}

type TransmissionSettings = {
  bitrate: number;
  fps: number;
  quality: QualityPreset;
};

function getTransmissionSettings(): TransmissionSettings {
  const qualityKey = qualitySelect.value as QualityKey;
  const bandwidthProfileKey =
    bandwidthProfileSelect.value === "bold" ? "bold" : "humble";
  const quality = qualityPresets[qualityKey] ?? qualityPresets.p480;
  const fps = Number.parseInt(fpsSelect.value, 10);

  return {
    bitrate: quality.bitrates[bandwidthProfileKey],
    fps: fps === 60 ? 60 : 30,
    quality,
  };
}

function formatBitrate(bitrate: number) {
  return `${(bitrate / 1_000_000).toFixed(2)} Mbps`;
}

type StatsSample = {
  bytes: number;
  timestamp: number;
};

type RtcVideoStatsReport = {
  bytesSent: number;
  codecId?: string;
  frameHeight?: number;
  frameWidth?: number;
  framesPerSecond?: number;
  id: string;
  kind?: string;
  mimeType: string;
  qualityLimitationReason?: string;
  timestamp: number;
  type: string;
};

function startOutboundDiagnostics(track: LocalVideoTrack) {
  stopOutboundDiagnostics();
  previousStats = null;

  statsInterval = window.setInterval(() => {
    void collectOutboundDiagnostics(track);
  }, 1500);
}

function stopOutboundDiagnostics() {
  if (statsInterval) {
    window.clearInterval(statsInterval);
  }

  statsInterval = null;
  previousStats = null;
  outboundDiagnosticsText = "Envio real: aguardando.";
  renderDiagnostics();
}

async function collectOutboundDiagnostics(track: LocalVideoTrack) {
  const sender = (track as unknown as { sender?: RTCRtpSender }).sender;

  if (!sender) {
    outboundDiagnosticsText = "Envio real: sender não exposto.";
    renderDiagnostics();
    return;
  }

  const stats = await sender.getStats();
  const reports = Array.from(stats.values()) as RtcVideoStatsReport[];
  const codecById = new Map<string, string>();

  reports.forEach((report) => {
    if (report.type === "codec") {
      codecById.set(report.id, report.mimeType.replace(/^video\//i, ""));
    }
  });

  const outbound =
    reports.find((report) => report.type === "outbound-rtp" && report.kind === "video") ??
    null;

  if (!outbound) {
    outboundDiagnosticsText = "Envio real: aguardando stats de vídeo.";
    renderDiagnostics();
    return;
  }

  const current = {
    bytes: outbound.bytesSent,
    timestamp: outbound.timestamp,
  };
  const previous = previousStats;
  previousStats = current;

  const bitrate =
    previous && current.timestamp > previous.timestamp
      ? ((current.bytes - previous.bytes) * 8) /
        ((current.timestamp - previous.timestamp) / 1000)
      : 0;
  const codec = outbound.codecId ? codecById.get(outbound.codecId) : null;
  const limitation =
    outbound.qualityLimitationReason && outbound.qualityLimitationReason !== "none"
      ? ` / limite: ${outbound.qualityLimitationReason}`
      : "";

  outboundDiagnosticsText = `Envio real: ${formatBitrate(bitrate)} / ${
    outbound.frameWidth ?? "?"
  }x${outbound.frameHeight ?? "?"} / ${Math.round(
    outbound.framesPerSecond ?? 0,
  )} FPS / ${codec ?? "codec ?"}${limitation}`;
  renderDiagnostics();
}

function startCaptureDiagnostics(stream: MediaStream) {
  stopCaptureDiagnostics();

  const videoTrack = stream.getVideoTracks()[0];

  if (!videoTrack) {
    captureDiagnosticsText = "Captura real: sem faixa de vídeo.";
    renderDiagnostics();
    return;
  }

  captureStatsVideo = document.createElement("video");
  captureStatsVideo.muted = true;
  captureStatsVideo.playsInline = true;
  captureStatsVideo.srcObject = new MediaStream([videoTrack]);
  captureStatsFrameCount = 0;
  captureStatsStartedAt = performance.now();
  captureDiagnosticsText = "Captura real: medindo.";
  renderDiagnostics();

  void captureStatsVideo.play().then(() => {
    scheduleCaptureFrame();
  });
}

function stopCaptureDiagnostics() {
  if (captureStatsAnimation) {
    window.cancelAnimationFrame(captureStatsAnimation);
  }

  captureStatsAnimation = 0;
  captureStatsVideo?.pause();
  captureStatsVideo = null;
  captureStatsFrameCount = 0;
  captureStatsStartedAt = 0;
  captureDiagnosticsText = "Captura real: aguardando.";
  renderDiagnostics();
}

function scheduleCaptureFrame() {
  if (!captureStatsVideo) {
    return;
  }

  if ("requestVideoFrameCallback" in captureStatsVideo) {
    captureStatsVideo.requestVideoFrameCallback(() => {
      updateCaptureFrameCount();
      scheduleCaptureFrame();
    });
    return;
  }

  captureStatsAnimation = window.requestAnimationFrame(() => {
    updateCaptureFrameCount();
    scheduleCaptureFrame();
  });
}

function updateCaptureFrameCount() {
  if (!captureStatsVideo) {
    return;
  }

  captureStatsFrameCount += 1;
  const elapsedSeconds = (performance.now() - captureStatsStartedAt) / 1000;

  if (elapsedSeconds < 1) {
    return;
  }

  const settings = captureStatsVideo.srcObject instanceof MediaStream
    ? captureStatsVideo.srcObject.getVideoTracks()[0]?.getSettings()
    : null;
  const measuredFps = captureStatsFrameCount / elapsedSeconds;
  captureDiagnosticsText = `Captura real: ${settings?.width ?? "?"}x${
    settings?.height ?? "?"
  } / ${Math.round(measuredFps)} FPS`;
  captureStatsFrameCount = 0;
  captureStatsStartedAt = performance.now();
  renderDiagnostics();
}

function renderDiagnostics() {
  diagnostics.textContent = `${captureDiagnosticsText} | ${outboundDiagnosticsText}`;
}

async function createLiveKitToken(
  sessionId: string,
): Promise<{ token: string; url: string }> {
  const response = await fetch(`${appUrl}/api/livekit/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ sessionId, role: "publisher" }),
  });

  if (!response.ok) {
    throw new Error("Failed to create LiveKit token.");
  }

  return (await response.json()) as { token: string; url: string };
}

function setCaptureButtons(state: "idle" | "preview" | "broadcast") {
  startPreviewButton.disabled = state !== "idle";
  startBroadcastButton.disabled = state !== "idle";
  stopButton.disabled = state === "idle";
  captureAudioInput.disabled = state !== "idle";
  showPreviewInput.disabled = state !== "idle";
  bandwidthProfileSelect.disabled = state !== "idle";
  qualitySelect.disabled = state !== "idle";
  fpsSelect.disabled = state !== "idle";
}

function getElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);

  if (!element) {
    throw new Error(`Missing element: ${selector}`);
  }

  return element;
}

async function bootstrap() {
  appUrl = (await window.toveno?.getAppUrl()) ?? appUrl;
  await loadSources();
}

void bootstrap();
