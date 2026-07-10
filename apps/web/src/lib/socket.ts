import { io, type Socket } from "socket.io-client";
import { SOCKET_EVENTS } from "@beyblade/shared";

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL ?? undefined;

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    socket = io(SOCKET_URL, {
      autoConnect: false,
      transports: ["websocket", "polling"],
    });
  }
  return socket;
}

export function joinTournamentRoom(
  tournamentId: string,
  role: string = "VIEWER",
  pin?: string
): Promise<unknown> {
  const s = getSocket();
  if (!s.connected) s.connect();

  return new Promise((resolve, reject) => {
    s.emit(
      SOCKET_EVENTS.JOIN_TOURNAMENT,
      { tournamentId, role, pin },
      (ack: { ok?: boolean; error?: string }) => {
        if (ack?.error) reject(new Error(ack.error));
        else resolve(ack);
      }
    );
  });
}

export function leaveTournamentRoom() {
  const s = getSocket();
  s.emit(SOCKET_EVENTS.LEAVE_TOURNAMENT);
}

export { SOCKET_EVENTS };
