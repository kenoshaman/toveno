"use client";

import {
  RemoteParticipant,
  RemoteTrack,
  RemoteTrackPublication,
  Room,
  RoomEvent,
  Track,
} from "livekit-client";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { StatusBubble } from "@/components/status-bubble";
import { PlayerControls } from "@/components/player-controls";
import {
  clearRoomVerification,
  getStoredRoomPassword,
  ROOM_GATE_EVENT,
  ROOM_PRIVACY_UPDATED_MESSAGE,
  type RoomGateEventDetail,
} from "@/lib/session-gate";

type WatchScreenProps = {
  sessionId: string;
};

export function WatchScreen({ sessionId }: WatchScreenProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const stageRef = useRef<HTMLElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const roomRef = useRef<Room | null>(null);
  const currentVideoTrackRef = useRef<RemoteTrack | null>(null);
  const currentPublisherRef = useRef<string | null>(null);
  const statsIntervalRef = useRef<number | null>(null);
  const previousStatsRef = useRef<StatsSample | null>(null);
  const connectRef = useRef<() => Promise<void>>(async () => {});
  const isConnectedOrConnectingRef = useRef(false);
  const [status, setStatus] = useState("Conectando ao LiveKit...");
  const [diagnostics, setDiagnostics] = useState("Diagnóstico aguardando vídeo.");
  const [error, setError] = useState<string | null>(null);
  const [hasVideo, setHasVideo] = useState(false);
  const [needsUserPlay, setNeedsUserPlay] = useState(false);
  const [needsAudioPlay, setNeedsAudioPlay] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function connect() {
      if (isConnectedOrConnectingRef.current) {
        return;
      }
      isConnectedOrConnectingRef.current = true;

      try {
        const password = getStoredRoomPassword(sessionId) ?? undefined;
        const { token, url } = await createLiveKitToken(sessionId, "viewer", password);
        const room = new Room();
        roomRef.current = room;

        room.on(
          RoomEvent.TrackSubscribed,
          (
            track: RemoteTrack,
            publication: RemoteTrackPublication,
            participant: RemoteParticipant,
          ) => {
            if (track.kind === Track.Kind.Video && videoRef.current) {
              currentVideoTrackRef.current?.detach();
              currentVideoTrackRef.current = track;
              currentPublisherRef.current = participant.identity;
              track.attach(videoRef.current);
              startInboundDiagnostics(track);
              videoRef.current
                .play()
                .then(() => {
                  setNeedsUserPlay(false);
                })
                .catch(() => {
                  setNeedsUserPlay(true);
                  setStatus("Clique em Iniciar vídeo para reproduzir.");
                });
              setStatus(
                publication.source === Track.Source.ScreenShare
                  ? "Recebendo compartilhamento de tela."
                  : "Recebendo vídeo.",
              );
            }

            if (track.kind === Track.Kind.Audio && audioRef.current) {
              track.attach(audioRef.current);
              audioRef.current
                .play()
                .then(() => {
                  setNeedsAudioPlay(false);
                })
                .catch(() => {
                  setNeedsAudioPlay(true);
                  setStatus("Clique em Ativar áudio para ouvir a transmissão.");
                });
            }
          },
        );

        room.on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack) => {
          track.detach();
          if (track === currentVideoTrackRef.current) {
            currentVideoTrackRef.current = null;
            currentPublisherRef.current = null;
            stopInboundDiagnostics();
            setHasVideo(false);
            setNeedsUserPlay(false);
            setStatus("Vídeo removido pelo transmissor. Aguardando novo vídeo.");
          }
        });

        room.on(RoomEvent.ParticipantDisconnected, (participant) => {
          if (
            !currentPublisherRef.current ||
            participant.identity === currentPublisherRef.current
          ) {
            currentVideoTrackRef.current?.detach();
            currentVideoTrackRef.current = null;
            currentPublisherRef.current = null;
            stopInboundDiagnostics();
            setHasVideo(false);
            setNeedsUserPlay(false);
            setStatus("Transmissor saiu da sala. Aguardando reconexão.");
          }
        });

        room.on(RoomEvent.Reconnecting, () => {
          setStatus("Reconectando ao LiveKit...");
        });

        room.on(RoomEvent.Reconnected, () => {
          setStatus(
            currentVideoTrackRef.current
              ? "Reconectado. Assistindo transmissão."
              : "Reconectado. Aguardando vídeo do transmissor.",
          );
        });

        room.on(RoomEvent.Disconnected, (reason) => {
          setHasVideo(false);
          setStatus(`Desconectado do LiveKit: ${reason ?? "sem motivo informado"}.`);
        });

        room.on(RoomEvent.DataReceived, (payload) => {
          try {
            const message = JSON.parse(new TextDecoder().decode(payload)) as { type?: string };
            if (message.type === ROOM_PRIVACY_UPDATED_MESSAGE) {
              clearRoomVerification(sessionId);
              window.location.reload();
            }
          } catch {
            // Mensagem em formato inesperado; ignora.
          }
        });

        await room.connect(url, token);

        if (isMounted) {
          setStatus("Aguardando vídeo do transmissor.");
        }
      } catch {
        isConnectedOrConnectingRef.current = false;
        if (isMounted) {
          setError("Não foi possível conectar ao LiveKit.");
          setStatus("Falha de conexão.");
        }
      }
    }

    connectRef.current = connect;
    void connect();

    return () => {
      isMounted = false;
      isConnectedOrConnectingRef.current = false;
      roomRef.current?.disconnect();
      roomRef.current = null;
      currentVideoTrackRef.current?.detach();
      currentVideoTrackRef.current = null;
      currentPublisherRef.current = null;
      stopInboundDiagnostics();
    };
  }, [sessionId]);

  useEffect(() => {
    function handleRoomGatePassed(event: Event) {
      const detail = (event as CustomEvent<RoomGateEventDetail>).detail;
      if (detail?.sessionId === sessionId) {
        void connectRef.current();
      }
    }

    window.addEventListener(ROOM_GATE_EVENT, handleRoomGatePassed);
    return () => window.removeEventListener(ROOM_GATE_EVENT, handleRoomGatePassed);
  }, [sessionId]);

  async function startVideoPlayback() {
    try {
      await videoRef.current?.play();
      await audioRef.current?.play().catch(() => undefined);
      setNeedsUserPlay(false);
      setNeedsAudioPlay(false);
      setHasVideo(true);
      setStatus("Assistindo transmissão.");
    } catch {
      setError("O navegador bloqueou a reprodução automática do vídeo.");
    }
  }

  async function startAudioPlayback() {
    try {
      await audioRef.current?.play();
      setNeedsAudioPlay(false);
      setStatus("Áudio ativado.");
    } catch {
      setError("O navegador bloqueou a reprodução automática do áudio.");
    }
  }

  return (
    <main className="app-shell watch-shell">
      <section className="stage stage-max" aria-label="Player da transmissão" ref={stageRef}>
        <video
          ref={videoRef}
          autoPlay
          playsInline
          onLoadedData={() => {
            setHasVideo(true);
            setStatus("Assistindo transmissão.");
          }}
          onPlaying={() => {
            setHasVideo(true);
            setStatus("Assistindo transmissão.");
          }}
          onWaiting={() => {
            setStatus("Recebendo vídeo, aguardando frames...");
          }}
        />
        <audio ref={audioRef} autoPlay />
        {!hasVideo ? (
          <div className="empty-state">
            {needsUserPlay ? (
              <>
                <p>{status}</p>
                <button type="button" className="plain-button" onClick={startVideoPlayback}>
                  Iniciar vídeo
                </button>
              </>
            ) : (
              <>
                <div className="plug-figure sketchy-round">
                  <Image
                    src="/icon/raccoon_plugs_full.svg"
                    alt=""
                    width={168}
                    height={168}
                    className="plug-figure-img"
                  />
                  <span className="plug-spinner" aria-hidden />
                </div>
                <p className="plug-caption">Puxaro Cabo</p>
              </>
            )}
          </div>
        ) : null}

        <div className="stage-status-corner">
          <StatusBubble live={hasVideo} status={status} error={error} />
        </div>

        {hasVideo ? <PlayerControls videoRef={videoRef} stageRef={stageRef} /> : null}
      </section>

      {needsAudioPlay ? (
        <button type="button" className="plain-button audio-fab" onClick={startAudioPlayback}>
          Ativar áudio
        </button>
      ) : null}
    </main>
  );

  function startInboundDiagnostics(track: RemoteTrack) {
    stopInboundDiagnostics();
    previousStatsRef.current = null;

    statsIntervalRef.current = window.setInterval(() => {
      void collectInboundDiagnostics(track);
    }, 1500);
  }

  function stopInboundDiagnostics() {
    if (statsIntervalRef.current) {
      window.clearInterval(statsIntervalRef.current);
    }

    statsIntervalRef.current = null;
    previousStatsRef.current = null;
    setDiagnostics("Diagnóstico aguardando vídeo.");
  }

  async function collectInboundDiagnostics(track: RemoteTrack) {
    const receiver = (track as unknown as { receiver?: RTCRtpReceiver }).receiver;

    if (!receiver) {
      setDiagnostics("Diagnóstico indisponível: receiver não exposto.");
      return;
    }

    const stats = await receiver.getStats();
    const codecById = new Map<string, string>();
    const reports = Array.from(stats.values()) as RtcVideoStatsReport[];

    reports.forEach((report) => {
      if (report.type === "codec") {
        codecById.set(report.id, report.mimeType.replace(/^video\//i, ""));
      }
    });

    const inbound =
      reports.find((report) => report.type === "inbound-rtp" && report.kind === "video") ??
      null;

    if (!inbound) {
      setDiagnostics("Diagnóstico aguardando stats de vídeo.");
      return;
    }

    const current = {
      bytes: inbound.bytesReceived,
      timestamp: inbound.timestamp,
    };
    const previous = previousStatsRef.current;
    previousStatsRef.current = current;

    const bitrate =
      previous && current.timestamp > previous.timestamp
        ? ((current.bytes - previous.bytes) * 8) /
          ((current.timestamp - previous.timestamp) / 1000)
        : 0;
    const codec = inbound.codecId ? codecById.get(inbound.codecId) : null;
    const lost = inbound.packetsLost ?? 0;

    setDiagnostics(
      `Recebido real: ${formatBitrate(bitrate)} / ${inbound.frameWidth ?? "?"}x${
        inbound.frameHeight ?? "?"
      } / ${Math.round(inbound.framesPerSecond ?? 0)} FPS / ${codec ?? "codec ?"} / perda ${lost}`,
    );
  }
}

type StatsSample = {
  bytes: number;
  timestamp: number;
};

type RtcVideoStatsReport = {
  bytesReceived: number;
  codecId?: string;
  frameHeight?: number;
  frameWidth?: number;
  framesPerSecond?: number;
  id: string;
  kind?: string;
  mimeType: string;
  packetsLost?: number;
  timestamp: number;
  type: string;
};

function formatBitrate(bitrate: number) {
  return `${(bitrate / 1_000_000).toFixed(2)} Mbps`;
}

async function createLiveKitToken(
  sessionId: string,
  role: "publisher" | "viewer",
  password?: string,
): Promise<{ token: string; url: string }> {
  const response = await fetch("/api/livekit/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ sessionId, role, password }),
  });

  if (!response.ok) {
    throw new Error("Failed to create LiveKit token.");
  }

  return (await response.json()) as { token: string; url: string };
}
