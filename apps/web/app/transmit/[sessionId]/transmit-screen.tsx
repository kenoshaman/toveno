"use client";

import { LocalVideoTrack, Room } from "livekit-client";
import { useEffect, useRef, useState } from "react";

type TransmitScreenProps = {
  sessionId: string;
};

type BandwidthProfileKey = "humble" | "bold";
type QualityKey = "p480" | "p720" | "p1080";
type FpsValue = 30 | 60;

const qualityPresets: Record<
  QualityKey,
  {
    label: string;
    width: number;
    height: number;
    bitrates: Record<BandwidthProfileKey, number>;
  }
> = {
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

export function TransmitScreen({ sessionId }: TransmitScreenProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const roomRef = useRef<Room | null>(null);
  const statsIntervalRef = useRef<number | null>(null);
  const previousStatsRef = useRef<StatsSample | null>(null);
  const isStartingRef = useRef(false);
  const [appOrigin, setAppOrigin] = useState("");
  const [isSharing, setIsSharing] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [status, setStatus] = useState("480p / 30 FPS");
  const [diagnostics, setDiagnostics] = useState("Diagnóstico aguardando transmissão.");
  const [error, setError] = useState<string | null>(null);
  const [bandwidthProfile, setBandwidthProfile] =
    useState<BandwidthProfileKey>("humble");
  const [quality, setQuality] = useState<QualityKey>("p480");
  const [fps, setFps] = useState<FpsValue>(30);
  const [shareAudio, setShareAudio] = useState(true);

  useEffect(() => {
    setAppOrigin(window.location.origin);

    function handleError(event: ErrorEvent) {
      if (isLiveKitShareError(event.message)) {
        event.preventDefault();
        setError("A captura caiu. Clique em Parar e compartilhe novamente.");
        setStatus("Captura interrompida.");
      }
    }

    function handleRejection(event: PromiseRejectionEvent) {
      const message =
        event.reason instanceof Error
          ? event.reason.message
          : String(event.reason ?? "");

      if (isLiveKitShareError(message)) {
        event.preventDefault();
        setError("A captura caiu. Clique em Parar e compartilhe novamente.");
        setStatus("Captura interrompida.");
      }
    }

    window.addEventListener("error", handleError);
    window.addEventListener("unhandledrejection", handleRejection);

    return () => {
      window.removeEventListener("error", handleError);
      window.removeEventListener("unhandledrejection", handleRejection);
    };
  }, []);

  const desktopOpenUrl = `toveno://transmit/${sessionId}${
    appOrigin ? `?appUrl=${encodeURIComponent(appOrigin)}` : ""
  }`;

  async function startSharing() {
    if (isStartingRef.current || isSharing) {
      return;
    }

    isStartingRef.current = true;
    setIsStarting(true);
    setError(null);
    setStatus("Abrindo seletor de tela...");

    if (!navigator.mediaDevices?.getDisplayMedia) {
      setError("Este navegador não suporta captura de tela.");
      setStatus("Captura indisponível.");
      isStartingRef.current = false;
      setIsStarting(false);
      return;
    }

    try {
      if (roomRef.current) {
        await stopSharing();
      }

      const { token, url } = await createLiveKitToken(sessionId, "publisher");
      const room = new Room({
        reconnectPolicy: {
          nextRetryDelayInMs: () => null,
        },
      });
      await room.connect(url, token);
      roomRef.current = room;

      setStatus("Conectado. Escolha a tela para transmitir...");

      const publication = await room.localParticipant.setScreenShareEnabled(
        true,
        {
          audio: shareAudio,
          resolution: {
            width: qualityPresets[quality].width,
            height: qualityPresets[quality].height,
            frameRate: fps,
          },
          systemAudio: shareAudio ? "include" : "exclude",
          windowAudio: shareAudio ? "window" : "exclude",
          contentHint: fps >= 60 ? "motion" : "detail",
        } as Parameters<typeof room.localParticipant.setScreenShareEnabled>[1] & {
          windowAudio: "exclude" | "window";
        },
        {
          simulcast: false,
          screenShareEncoding: {
            maxBitrate: qualityPresets[quality].bitrates[bandwidthProfile],
            maxFramerate: fps,
          },
        },
      );

      const track = publication?.track;

      if (!(track instanceof LocalVideoTrack)) {
        throw new Error("No screen video track was published.");
      }

      if (videoRef.current) {
        track.attach(videoRef.current);
      }
      startOutboundDiagnostics(track);

      track.mediaStreamTrack.addEventListener("ended", () => {
        void stopSharing();
      });

      setIsSharing(true);
      setIsConnected(true);
      setStatus(
        `Conectado ao LiveKit. ${qualityPresets[quality].label} / ${fps} FPS / ${formatBitrate(
          qualityPresets[quality].bitrates[bandwidthProfile],
        )} / áudio ${shareAudio ? "ligado" : "desligado"}.`,
      );
    } catch {
      setError("Não foi possível conectar a transmissão ao LiveKit.");
      setStatus("Falha ao conectar.");
      await stopSharing();
    } finally {
      isStartingRef.current = false;
      setIsStarting(false);
    }
  }

  async function stopSharing() {
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    await roomRef.current?.localParticipant.setScreenShareEnabled(false);
    stopOutboundDiagnostics();
    roomRef.current?.disconnect();
    roomRef.current = null;
    setIsSharing(false);
    setIsConnected(false);
    setStatus("480p / 30 FPS");
  }

  function startOutboundDiagnostics(track: LocalVideoTrack) {
    stopOutboundDiagnostics();
    previousStatsRef.current = null;

    statsIntervalRef.current = window.setInterval(() => {
      void collectOutboundDiagnostics(track);
    }, 1500);
  }

  function stopOutboundDiagnostics() {
    if (statsIntervalRef.current) {
      window.clearInterval(statsIntervalRef.current);
    }

    statsIntervalRef.current = null;
    previousStatsRef.current = null;
    setDiagnostics("Diagnóstico aguardando transmissão.");
  }

  async function collectOutboundDiagnostics(track: LocalVideoTrack) {
    const sender = (track as unknown as { sender?: RTCRtpSender }).sender;

    if (!sender) {
      setDiagnostics("Diagnóstico indisponível: sender não exposto.");
      return;
    }

    const stats = await sender.getStats();
    const codecById = new Map<string, string>();
    const reports = Array.from(stats.values()) as RtcVideoStatsReport[];

    reports.forEach((report) => {
      if (report.type === "codec") {
        codecById.set(report.id, report.mimeType.replace(/^video\//i, ""));
      }
    });

    const outbound =
      reports.find((report) => report.type === "outbound-rtp" && report.kind === "video") ??
      null;

    if (!outbound) {
      setDiagnostics("Diagnóstico aguardando stats de vídeo.");
      return;
    }

    const current = {
      bytes: outbound.bytesSent,
      timestamp: outbound.timestamp,
    };
    const previous = previousStatsRef.current;
    previousStatsRef.current = current;

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

    setDiagnostics(
      `Envio real: ${formatBitrate(bitrate)} / ${outbound.frameWidth ?? "?"}x${
        outbound.frameHeight ?? "?"
      } / ${Math.round(outbound.framesPerSecond ?? 0)} FPS / ${codec ?? "codec ?"}${
        limitation
      }`,
    );
  }

  return (
    <main className="app-shell">
      <section className="toolbar">
        <div>
          <p className="eyebrow">Transmissor</p>
          <h1>Compartilhar tela</h1>
        </div>
        <span className="session-pill">{sessionId}</span>
      </section>

      <section className="transmit-layout">
        <section className="browser-preview">
          <section className="stage compact-stage" aria-label="Prévia da tela compartilhada">
            <video ref={videoRef} autoPlay muted playsInline />
            {!isSharing ? (
              <div className="empty-state">
                <p>Nenhuma tela selecionada.</p>
              </div>
            ) : null}
          </section>
        </section>

        <aside className="transmit-panel">
          <section className="panel-block">
            <strong>Compartilhar pelo navegador</strong>
            <span>{isConnected ? status : "Configure e clique em Compartilhar."}</span>

            <div className="browser-settings" aria-label="Configurações da transmissão">
              <label>
                <span>Internet</span>
                <select
                  value={bandwidthProfile}
                  disabled={isSharing}
                  onChange={(event) =>
                    setBandwidthProfile(event.target.value as BandwidthProfileKey)
                  }
                >
                  <option value="humble">Humilde</option>
                  <option value="bold">Desumilde</option>
                </select>
              </label>

              <label>
                <span>Qualidade</span>
                <select
                  value={quality}
                  disabled={isSharing}
                  onChange={(event) => setQuality(event.target.value as QualityKey)}
                >
                  {Object.entries(qualityPresets).map(([key, preset]) => (
                    <option key={key} value={key}>
                      {preset.label}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                <span>FPS</span>
                <select
                  value={fps}
                  disabled={isSharing}
                  onChange={(event) => setFps(Number(event.target.value) as FpsValue)}
                >
                  <option value={30}>30 FPS</option>
                  <option value={60}>60 FPS</option>
                </select>
              </label>

              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={shareAudio}
                  disabled={isSharing}
                  onChange={(event) => setShareAudio(event.target.checked)}
                />
                <span>Compartilhar áudio da tela</span>
              </label>
            </div>

            {shareAudio && !isSharing ? (
              <p className="hint">
                Para áudio confiável no navegador, escolha Guia do Chrome no seletor.
              </p>
            ) : null}

            <div className="button-stack">
              {!isSharing ? (
                <button type="button" disabled={isStarting} onClick={startSharing}>
                  {isStarting ? "Iniciando..." : "Compartilhar pelo navegador"}
                </button>
              ) : (
                <button type="button" className="danger" onClick={stopSharing}>
                  Parar transmissão
                </button>
              )}
            </div>
          </section>

          <section className="panel-block status-block">
            <strong>Status</strong>
            <span>{status}</span>
            <span>{diagnostics}</span>
          </section>

          <section className="panel-block desktop-secondary">
            <strong>ToVeno Desktop</strong>
            <span>Opcional para jogos, janelas e áudio de aplicativo.</span>
            <div className="button-stack">
              <a className="button-link secondary" href={desktopOpenUrl}>
                Abrir ToVeno
              </a>
              <a className="button-link secondary" href="/downloads/ToVeno-Setup.exe">
                Instalar ToVeno
              </a>
            </div>
          </section>
        </aside>
      </section>

      {error ? <p className="error">{error}</p> : null}
    </main>
  );
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

function isLiveKitShareError(message: string): boolean {
  return (
    message.includes("negotiation timed out") ||
    message.includes("re-publish tracks after reconnection")
  );
}

function formatBitrate(bitrate: number) {
  return `${bitrate / 1_000_000} Mbps`;
}

async function createLiveKitToken(
  sessionId: string,
  role: "publisher" | "viewer",
): Promise<{ token: string; url: string }> {
  const response = await fetch("/api/livekit/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ sessionId, role }),
  });

  if (!response.ok) {
    throw new Error("Failed to create LiveKit token.");
  }

  return (await response.json()) as { token: string; url: string };
}
