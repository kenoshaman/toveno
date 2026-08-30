"use client";

import { LocalVideoTrack, Room } from "livekit-client";
import { Eye, EyeOff, Monitor } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LoadingDots } from "@/components/loading-dots";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { ROOM_PRIVACY_UPDATED_MESSAGE } from "@/lib/session-gate";

const DIAGNOSTICS_IDLE_MESSAGE = "Diagnóstico aguardando transmissão.";

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
  const [diagnostics, setDiagnostics] = useState(DIAGNOSTICS_IDLE_MESSAGE);
  const [error, setError] = useState<string | null>(null);
  const [bandwidthProfile, setBandwidthProfile] =
    useState<BandwidthProfileKey>("humble");
  const [quality, setQuality] = useState<QualityKey>("p480");
  const [fps, setFps] = useState<FpsValue>(30);
  const [shareAudio, setShareAudio] = useState(true);
  const [isPrivateRoom, setIsPrivateRoom] = useState(false);
  const [roomPassword, setRoomPassword] = useState("");
  const [showRoomPassword, setShowRoomPassword] = useState(false);

  useEffect(() => {
    if (!isPrivateRoom) {
      void syncRoomPrivacy(sessionId, null);
    }
  }, [isPrivateRoom, sessionId]);

  async function applyRoomPrivacy() {
    if (isPrivateRoom && !roomPassword.trim()) {
      setError("Defina uma senha para a sala privada.");
      return;
    }

    await syncRoomPrivacy(sessionId, isPrivateRoom ? roomPassword.trim() : null);

    const room = roomRef.current;
    if (room) {
      const payload = new TextEncoder().encode(
        JSON.stringify({ type: ROOM_PRIVACY_UPDATED_MESSAGE }),
      );
      void room.localParticipant.publishData(payload, { reliable: true });
    }
  }

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

    if (isPrivateRoom && !roomPassword.trim()) {
      setError("Defina uma senha para a sala privada.");
      setStatus("Configure a senha para continuar.");
      isStartingRef.current = false;
      setIsStarting(false);
      return;
    }

    try {
      if (roomRef.current) {
        await stopSharing();
      }

      await syncRoomPrivacy(sessionId, isPrivateRoom ? roomPassword : null);

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
    void syncRoomPrivacy(sessionId, null);
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
    setDiagnostics(DIAGNOSTICS_IDLE_MESSAGE);
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
      <section className="toolbar shrink-0">
        <div>
          <p className="eyebrow">Transmissor</p>
          <h1 className="max-[900px]:hidden">Compartilhar tela</h1>
        </div>
      </section>

      <section className="min-h-0 flex-1">
        <div className="transmit-group">
          <div className="transmit-group-inner">
            <div className="transmit-stage-pane" aria-label="Prévia da tela compartilhada">
              <video ref={videoRef} autoPlay muted playsInline />
              {!isSharing ? (
                <div className="empty-state">
                  <p>{isStarting ? "Iniciando transmissão..." : "Nenhuma tela selecionada."}</p>
                  <LoadingDots />
                </div>
              ) : null}
            </div>

            <div className="transmit-settings-pane">
            <CardHeader>
              <CardTitle>Compartilhar pelo navegador</CardTitle>
              {isConnected ? (
                <p className="text-sm text-muted-foreground">{status}</p>
              ) : (
                <p className="text-sm text-muted-foreground max-[900px]:hidden">
                  Configure e clique em Compartilhar.
                </p>
              )}
            </CardHeader>

            <CardContent className="flex flex-col gap-4">
              <div
                className="grid grid-cols-3 gap-2"
                aria-label="Configurações da transmissão"
              >
                <div className="flex flex-col gap-1.5 min-w-0">
                  <Label className="text-xs">Internet</Label>
                  <Select
                    value={bandwidthProfile}
                    disabled={isSharing}
                    onValueChange={(value) =>
                      setBandwidthProfile(value as BandwidthProfileKey)
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="humble">Humilde</SelectItem>
                      <SelectItem value="bold">Desumilde</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex flex-col gap-1.5 min-w-0">
                  <Label className="text-xs">Qualidade</Label>
                  <Select
                    value={quality}
                    disabled={isSharing}
                    onValueChange={(value) => setQuality(value as QualityKey)}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(qualityPresets).map(([key, preset]) => (
                        <SelectItem key={key} value={key}>
                          {preset.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex flex-col gap-1.5 min-w-0">
                  <Label className="text-xs">FPS</Label>
                  <Select
                    value={String(fps)}
                    disabled={isSharing}
                    onValueChange={(value) => setFps(Number(value) as FpsValue)}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="30">30 FPS</SelectItem>
                      <SelectItem value="60">60 FPS</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <Label htmlFor="share-audio" className="justify-between text-sm">
                Áudio da tela
                <Switch
                  id="share-audio"
                  checked={shareAudio}
                  disabled={isSharing}
                  onCheckedChange={(checked) => setShareAudio(checked)}
                />
              </Label>

              <div className="flex flex-col gap-2">
                <Label htmlFor="private-room" className="justify-between">
                  Criar sala privada
                  <Switch
                    id="private-room"
                    checked={isPrivateRoom}
                    onCheckedChange={(checked) => setIsPrivateRoom(checked)}
                  />
                </Label>

                {isPrivateRoom ? (
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Input
                        type={showRoomPassword ? "text" : "password"}
                        value={roomPassword}
                        onChange={(event) => setRoomPassword(event.target.value)}
                        placeholder="Senha da sala"
                        autoComplete="new-password"
                        className="pr-9"
                      />
                      <button
                        type="button"
                        onClick={() => setShowRoomPassword((value) => !value)}
                        className="absolute inset-y-0 right-0 flex w-9 items-center justify-center text-muted-foreground hover:text-foreground"
                        aria-label={showRoomPassword ? "Ocultar senha" : "Mostrar senha"}
                        tabIndex={-1}
                      >
                        {showRoomPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                    <Button type="button" variant="outline" onClick={applyRoomPrivacy}>
                      Atualizar
                    </Button>
                  </div>
                ) : null}
              </div>

              {!isSharing ? (
                <Button
                  type="button"
                  disabled={isStarting}
                  onClick={startSharing}
                  className="w-full"
                >
                  {isStarting ? "Iniciando..." : "Compartilhar pelo navegador"}
                </Button>
              ) : (
                <Button
                  type="button"
                  onClick={stopSharing}
                  className="w-full bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  Parar transmissão
                </Button>
              )}

              <Dialog>
                <DialogTrigger asChild>
                  <Button type="button" variant="outline" className="w-full">
                    <Monitor size={16} />
                    ToVeno Desktop
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>ToVeno Desktop</DialogTitle>
                    <DialogDescription>
                      Opcional para jogos, janelas e áudio de aplicativo.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="flex flex-col gap-2">
                    <Button asChild variant="outline" className="w-full">
                      <a href={desktopOpenUrl}>Abrir ToVeno</a>
                    </Button>
                    <Button asChild variant="outline" className="w-full">
                      <a href="/downloads/ToVeno-Setup.exe">Instalar ToVeno</a>
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </CardContent>

            <Separator />

            <CardContent className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <span
                  className={`size-2 rounded-full ${
                    isConnected ? "bg-primary" : "bg-muted-foreground/40"
                  }`}
                  aria-hidden
                />
                <span className="text-sm font-medium">Status</span>
                <Badge variant={isConnected ? "default" : "secondary"} className="ml-auto">
                  {isConnected ? "Ao vivo" : "Parado"}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">{status}</p>
              {diagnostics !== DIAGNOSTICS_IDLE_MESSAGE ? (
                <p className="text-xs text-muted-foreground">{diagnostics}</p>
              ) : null}
            </CardContent>
            </div>
          </div>
        </div>
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

async function syncRoomPrivacy(sessionId: string, password: string | null) {
  try {
    await fetch(`/api/session/${encodeURIComponent(sessionId)}/private`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ password }),
    });
  } catch {
    // Falha ao sincronizar a privacidade não deve travar o compartilhamento.
  }
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
