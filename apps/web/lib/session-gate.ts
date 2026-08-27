const PASSWORD_PREFIX = "toveno-room-password:";
const VERIFIED_PREFIX = "toveno-room-verified:";

export const ROOM_GATE_EVENT = "toveno:room-gate-passed";

/** Enviado via canal de dados do LiveKit quando o transmissor atualiza o
 * modo (privada/pública) ou a senha da sala, para reenviar quem já está
 * assistindo de volta para a tela de entrada de senha. */
export const ROOM_PRIVACY_UPDATED_MESSAGE = "toveno-room-privacy-updated";

export type RoomGateEventDetail = {
  sessionId: string;
};

export function getStoredRoomPassword(sessionId: string): string | null {
  try {
    return window.sessionStorage.getItem(PASSWORD_PREFIX + sessionId);
  } catch {
    return null;
  }
}

export function isRoomVerified(sessionId: string): boolean {
  try {
    return window.sessionStorage.getItem(VERIFIED_PREFIX + sessionId) === "1";
  } catch {
    return false;
  }
}

export function storeVerifiedRoomPassword(sessionId: string, password: string) {
  try {
    window.sessionStorage.setItem(PASSWORD_PREFIX + sessionId, password);
    window.sessionStorage.setItem(VERIFIED_PREFIX + sessionId, "1");
  } catch {
    // Ambiente sem sessionStorage (ex: navegação privada); segue sem lembrar.
  }
}

export function dispatchRoomGatePassed(sessionId: string) {
  window.dispatchEvent(
    new CustomEvent<RoomGateEventDetail>(ROOM_GATE_EVENT, { detail: { sessionId } }),
  );
}

export function clearRoomVerification(sessionId: string) {
  try {
    window.sessionStorage.removeItem(PASSWORD_PREFIX + sessionId);
    window.sessionStorage.removeItem(VERIFIED_PREFIX + sessionId);
  } catch {
    // Ambiente sem sessionStorage; nada a limpar.
  }
}
