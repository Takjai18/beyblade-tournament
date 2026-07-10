import type { Server as HttpServer } from "node:http";
import { Server } from "socket.io";
import {
  SOCKET_EVENTS,
  tournamentRoom,
  JoinTournamentSocketSchema,
  ScoreMatchSchema,
} from "@beyblade/shared";
import { prisma } from "../lib/prisma.js";
import { env } from "../lib/env.js";

export type AppSocketServer = Server;

/**
 * Socket layer: room membership + thin wrappers that hit the same scoring
 * domain as REST (clients may also call REST directly).
 */
export function createSocketServer(httpServer: HttpServer): AppSocketServer {
  const io = new Server(httpServer, {
    cors: {
      origin: env.CORS_ORIGIN.split(",").map((s) => s.trim()),
      methods: ["GET", "POST", "PATCH", "DELETE"],
      credentials: true,
    },
  });

  io.on("connection", (socket) => {
    socket.data.tournamentId = null as string | null;
    socket.data.role = "VIEWER";

    socket.on(
      SOCKET_EVENTS.JOIN_TOURNAMENT,
      async (payload: unknown, ack?: (data: unknown) => void) => {
        try {
          const parsed = JoinTournamentSocketSchema.safeParse(payload);
          if (!parsed.success) {
            const err = { error: "無效的 join 參數" };
            socket.emit(SOCKET_EVENTS.ERROR, err);
            if (typeof ack === "function") ack(err);
            return;
          }

          const { tournamentId, role, pin } = parsed.data;
          const tournament = await prisma.tournament.findUnique({
            where: { id: tournamentId },
            select: { id: true, hostPin: true, slug: true, name: true },
          });

          if (!tournament) {
            const err = { error: "找不到賽事" };
            socket.emit(SOCKET_EVENTS.ERROR, err);
            if (typeof ack === "function") ack(err);
            return;
          }

          let resolvedRole = role;
          if (role === "HOST" || role === "REFEREE") {
            if (!pin || pin !== tournament.hostPin) {
              const err = { error: "PIN 錯誤，無法以裁判/主辦身份加入" };
              socket.emit(SOCKET_EVENTS.ERROR, err);
              if (typeof ack === "function") ack(err);
              return;
            }
            resolvedRole = role;
          }

          if (socket.data.tournamentId) {
            socket.leave(tournamentRoom(socket.data.tournamentId));
          }

          socket.data.tournamentId = tournamentId;
          socket.data.role = resolvedRole;
          socket.join(tournamentRoom(tournamentId));

          const result = {
            ok: true,
            tournamentId,
            role: resolvedRole,
            room: tournamentRoom(tournamentId),
          };
          if (typeof ack === "function") ack(result);
          socket.emit(SOCKET_EVENTS.TOURNAMENT_UPDATED, {
            reason: "joined",
            tournamentId,
          });
        } catch {
          const err = { error: "join_tournament 失敗" };
          socket.emit(SOCKET_EVENTS.ERROR, err);
          if (typeof ack === "function") ack(err);
        }
      }
    );

    socket.on(SOCKET_EVENTS.LEAVE_TOURNAMENT, () => {
      if (socket.data.tournamentId) {
        socket.leave(tournamentRoom(socket.data.tournamentId));
        socket.data.tournamentId = null;
      }
    });

    // Clients primarily use REST; socket events are convenience + ack.
    // Actual scoring is done via REST from the frontend for simpler error handling.
    // We still accept score_match / undo_match as "notify peers" is handled by REST emit.

    socket.on(
      SOCKET_EVENTS.SCORE_MATCH,
      async (payload: unknown, ack?: (data: unknown) => void) => {
        // Validate shape only — scoring is executed via REST
        const body =
          payload && typeof payload === "object"
            ? (payload as Record<string, unknown>)
            : {};
        const parsed = ScoreMatchSchema.safeParse({
          type: body.type,
          playerId: body.playerId,
          refereeName: body.refereeName,
          beyIndex: body.beyIndex,
        });
        if (!parsed.success) {
          const err = { error: "無效的計分參數，請改用 REST POST /api/matches/:id/score" };
          socket.emit(SOCKET_EVENTS.ERROR, err);
          if (typeof ack === "function") ack(err);
          return;
        }
        if (typeof ack === "function") {
          ack({
            ok: true,
            hint: "請使用 REST API 執行計分；此事件僅供相容",
          });
        }
      }
    );

    socket.on("disconnect", () => {
      socket.data.tournamentId = null;
    });
  });

  return io;
}

export function emitToTournament(
  io: AppSocketServer | undefined,
  tournamentId: string,
  event: string,
  payload: unknown
) {
  if (!io) return;
  io.to(tournamentRoom(tournamentId)).emit(event, payload);
}
