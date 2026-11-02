/**
 * Remote bridge: let a workshop console drive a far-away car over the
 * internet, the way the LAN workshop-console bridge does locally.
 *
 * A friend opens "Share with workshop" in the app (explicit opt-in per
 * session, with a live on-screen banner and a kill switch). Their phone
 * holds a WebSocket to this backend and executes ELM commands it is sent.
 * An admin console attaches over a second WebSocket, sees the online
 * cars, and sends commands back and forth.
 *
 * Roles (one socket each):
 *   car     - the phone app next to the dongle. Authenticates with a USER
 *             session token, registers with its vehicle identity.
 *   console - the admin panel. Authenticates with an ADMIN session token.
 *
 * Safety (enforced here AND on the phone - either side can veto):
 *   - Default-deny: only read-oriented ELM services go through
 *     (01, 02, 03, 05, 06, 07, 09, 0A, 21, 22, 2A) plus a small AT
 *     subset needed for make-specific reads (SH/CRA/AR/DPN/RV/etc).
 *   - Always blocked: Mode 04 (clear DTCs), Mode 08 (actuations), CAN
 *     monitor modes (MA/MR/MT), and anything that is not a plain ELM
 *     request or an allowed AT command.
 *   - Every command (allowed or blocked) is written to the audit log.
 */

import type { Server as HttpServer } from 'http';
import type { Socket } from 'net';
import { WebSocketServer, WebSocket } from 'ws';
import mongoose from 'mongoose';

// ---------------------------------------------------------------------------
// Safety filter (mirrored on the phone - keep the two copies in sync)
// ---------------------------------------------------------------------------

/** ELM services that only read. Everything else (04 clear, 08 control, ...) is blocked. */
const ALLOWED_SERVICES = new Set(['01', '02', '03', '05', '06', '07', '09', '0A', '21', '22', '2A']);

/** AT commands a remote console may issue (headers/filters/probing only). */
const ALLOWED_AT = /^(SH|CRA|AR|DPN?|RV|E[01]|L[01]|S[01]|H[01]|SP|ST|AT[012]|Z|D|PC|WS|I|@1|DPN)\b/i;

export interface SafetyVerdict {
  allowed: boolean;
  reason?: string;
}

/**
 * Decide whether a raw ELM command line may be executed on someone else's
 * car. Default-deny: unknown shapes are blocked, never passed.
 */
export function remoteCommandAllowed(rawCmd: string): SafetyVerdict {
  const cmd = rawCmd.trim().toUpperCase();
  if (!cmd) return { allowed: false, reason: 'empty command' };
  if (cmd.startsWith('AT')) {
    const at = cmd.slice(2).trim();
    if (ALLOWED_AT.test(at)) return { allowed: true };
    return { allowed: false, reason: `AT command not allowed remotely: ${at.split(/\s/)[0] || 'AT'}` };
  }
  // Service byte = first two hex digits (spaces stripped first, so '22 1940'
  // and '221940' both yield service 22; no \b - it never matches mid-token).
  const flat = cmd.replace(/\s+/g, '');
  const m = /^([0-9A-F]{2})(?=[0-9A-F]|$)/.exec(flat);
  const svc = m?.[1];
  if (!svc) return { allowed: false, reason: 'not a recognised ELM request' };
  if (ALLOWED_SERVICES.has(svc)) return { allowed: true };
  if (svc === '04') return { allowed: false, reason: 'Mode 04 (clear DTCs) is blocked on remote sessions' };
  if (svc === '08') return { allowed: false, reason: 'Mode 08 (actuator control) is blocked on remote sessions' };
  return { allowed: false, reason: `service ${svc} is not readable remotely` };
}

// ---------------------------------------------------------------------------
// Audit log
// ---------------------------------------------------------------------------

const remoteCommandSchema = new mongoose.Schema({
  sessionId: { type: String, required: true, index: true },
  vehicleClientId: { type: String },
  make: { type: String },
  model: { type: String },
  year: { type: Number },
  vin: { type: String },
  ownerPhone: { type: String },
  adminId: { type: String },
  adminEmail: { type: String },
  cmd: { type: String, required: true },
  allowed: { type: Boolean, required: true },
  blockReason: { type: String },
  ok: { type: Boolean },
  latencyMs: { type: Number },
  error: { type: String },
  createdAt: { type: Date, default: Date.now },
});
remoteCommandSchema.index({ createdAt: -1 });

export const RemoteCommand =
  mongoose.models.RemoteCommand ?? mongoose.model('RemoteCommand', remoteCommandSchema);

// ---------------------------------------------------------------------------
// Relay
// ---------------------------------------------------------------------------

export interface RemoteVehicle {
  clientId?: string;
  make?: string;
  model?: string;
  year?: number;
  vin?: string;
}

export interface RemoteSessionInfo {
  sessionId: string;
  vehicle: RemoteVehicle;
  ownerPhone?: string;
  connectedAt: string;
  lastSeenAt: string;
}

interface CarSocket {
  ws: WebSocket;
  sessionId: string;
  vehicle: RemoteVehicle;
  ownerPhone?: string;
  ownerUserId?: string;
  connectedAt: number;
  lastSeenAt: number;
  pending: Map<string, { resolve: (v: any) => void; timer: ReturnType<typeof setTimeout> }>;
}

interface ConsoleSocket {
  ws: WebSocket;
  adminId?: string;
  adminEmail?: string;
}

export interface RemoteBridgeDeps {
  /** Resolve a bearer token to { userId, userType, label? }. Return null when invalid. */
  findSession: (token: string) => Promise<{ userId: string; userType: string; label?: string } | null>;
}

const EXEC_TIMEOUT_MS = 20000;
const MAX_EXEC_TIMEOUT_MS = 60000;

function send(ws: WebSocket, msg: unknown): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

export function attachRemoteBridge(server: HttpServer, deps: RemoteBridgeDeps): {
  listSessions: () => RemoteSessionInfo[];
} {
  const cars = new Map<string, CarSocket>(); // sessionId -> car
  const consoles = new Set<ConsoleSocket>();
  let seq = 0;

  const broadcastSessions = (): void => {
    const list = listSessions();
    for (const c of consoles) {
      send(c.ws, { type: 'sessions', sessions: list });
    }
  };

  function listSessions(): RemoteSessionInfo[] {
    return [...cars.values()].map((c) => ({
      sessionId: c.sessionId,
      vehicle: c.vehicle,
      ownerPhone: c.ownerPhone,
      connectedAt: new Date(c.connectedAt).toISOString(),
      lastSeenAt: new Date(c.lastSeenAt).toISOString(),
    }));
  }

  async function audit(entry: Record<string, unknown>): Promise<void> {
    try {
      await RemoteCommand.create(entry);
    } catch (e) {
      console.error('[remote-bridge] audit write failed:', (e as Error)?.message ?? e);
    }
  }

  // NOTE: a single noServer instance with manual upgrade routing. Two
  // WebSocketServer({ server, path }) instances on one HTTP server corrupt
  // each other's handshakes (client sees "RSV1 must be clear"). Unknown
  // paths are ignored (never destroyed) so other upgrade users on the
  // same server - e.g. a live-OBD /ws channel - keep working.
  const wss = new WebSocketServer({ noServer: true });
  server.on('upgrade', (req, socket: Socket, head: Buffer) => {
    let pathname = '';
    try {
      pathname = new URL(req.url ?? '', 'http://localhost').pathname;
    } catch {
      return;
    }
    if (pathname !== '/ws/remote-car' && pathname !== '/ws/remote-console') {
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      if (pathname === '/ws/remote-car') handleCarConnection(ws);
      else handleConsoleConnection(ws);
    });
  });

  // -- car side ----------------------------------------------------------
  function handleCarConnection(ws: WebSocket): void {
    let car: CarSocket | null = null;
    let authed = false;

    ws.on('message', async (data) => {
      let msg: any;
      try {
        msg = JSON.parse(String(data));
      } catch {
        return;
      }
      if (!authed) {
        if (msg?.type !== 'hello' || msg?.role !== 'car') {
          send(ws, { type: 'error', error: 'send {type:"hello", role:"car", ...} first' });
          return;
        }
        const session = await deps.findSession(String(msg.token || ''));
        if (!session || session.userType !== 'user') {
          send(ws, { type: 'error', error: 'invalid or expired user session' });
          ws.close(4401, 'unauthorized');
          return;
        }
        authed = true;
        const sessionId = `car-${Date.now().toString(36)}-${(seq++).toString(36)}`;
        car = {
          ws,
          sessionId,
          vehicle: {
            clientId: msg.vehicle?.clientId,
            make: msg.vehicle?.make,
            model: msg.vehicle?.model,
            year: msg.vehicle?.year,
            vin: msg.vehicle?.vin,
          },
          ownerPhone: session.label,
          ownerUserId: session.userId,
          connectedAt: Date.now(),
          lastSeenAt: Date.now(),
          pending: new Map(),
        };
        cars.set(sessionId, car);
        send(ws, { type: 'welcome', sessionId });
        broadcastSessions();
        console.log(`[remote-bridge] car online: ${sessionId} (${car.vehicle.make ?? ''} ${car.vehicle.model ?? ''})`);
        return;
      }
      if (!car) return;
      car.lastSeenAt = Date.now();
      if (msg?.type === 'ping') {
        send(ws, { type: 'pong' });
        return;
      }
      if (msg?.type === 'result' && msg?.id) {
        const pending = car.pending.get(String(msg.id));
        if (pending) {
          clearTimeout(pending.timer);
          car.pending.delete(String(msg.id));
          pending.resolve(msg);
        }
      }
    });

    const drop = (): void => {
      if (car) {
        cars.delete(car.sessionId);
        for (const p of car.pending.values()) {
          clearTimeout(p.timer);
          p.resolve({ type: 'result', id: null, ok: false, error: 'car disconnected' });
        }
        console.log(`[remote-bridge] car offline: ${car.sessionId}`);
        car = null;
        broadcastSessions();
      }
    };
    ws.on('close', drop);
    ws.on('error', () => {});
  }

  // -- console side --------------------------------------------------------
  function handleConsoleConnection(ws: WebSocket): void {
    let con: ConsoleSocket | null = null;
    let authed = false;

    ws.on('message', async (data) => {
      let msg: any;
      try {
        msg = JSON.parse(String(data));
      } catch {
        return;
      }
      if (!authed) {
        if (msg?.type !== 'hello' || msg?.role !== 'console') {
          send(ws, { type: 'error', error: 'send {type:"hello", role:"console", ...} first' });
          return;
        }
        const session = await deps.findSession(String(msg.token || ''));
        if (!session || session.userType !== 'admin') {
          send(ws, { type: 'error', error: 'admin authorisation required' });
          ws.close(4401, 'unauthorized');
          return;
        }
        authed = true;
        con = { ws, adminId: session.userId, adminEmail: session.label };
        consoles.add(con);
        send(ws, { type: 'welcome', sessions: listSessions() });
        return;
      }

      if (msg?.type === 'sessions') {
        send(ws, { type: 'sessions', sessions: listSessions() });
        return;
      }

      if (msg?.type === 'exec') {
        const started = Date.now();
        const cmd = String(msg.cmd || '');
        const car = cars.get(String(msg.sessionId || ''));
        const baseAudit = {
          sessionId: String(msg.sessionId || ''),
          vehicleClientId: car?.vehicle.clientId,
          make: car?.vehicle.make,
          model: car?.vehicle.model,
          year: car?.vehicle.year,
          vin: car?.vehicle.vin,
          ownerPhone: car?.ownerPhone,
          adminId: con?.adminId,
          adminEmail: con?.adminEmail,
          cmd,
        };
        if (!car || car.ws.readyState !== WebSocket.OPEN) {
          send(ws, { type: 'result', id: msg.id ?? null, ok: false, error: 'car is no longer online' });
          await audit({ ...baseAudit, allowed: true, ok: false, error: 'car offline at exec' });
          return;
        }
        const verdict = remoteCommandAllowed(cmd);
        if (!verdict.allowed) {
          send(ws, { type: 'result', id: msg.id ?? null, ok: false, error: `blocked: ${verdict.reason}` });
          await audit({ ...baseAudit, allowed: false, blockReason: verdict.reason, ok: false });
          return;
        }
        const id = String(msg.id ?? `c${Date.now().toString(36)}${(seq++).toString(36)}`);
        const timeoutMs = Math.min(
          Math.max(Number(msg.timeoutMs) || EXEC_TIMEOUT_MS, 1000),
          MAX_EXEC_TIMEOUT_MS
        );
        const outcome = await new Promise<any>((resolve) => {
          const timer = setTimeout(() => {
            car!.pending.delete(id);
            resolve({ type: 'result', id, ok: false, error: `no reply from car within ${timeoutMs}ms` });
          }, timeoutMs);
          car!.pending.set(id, { resolve, timer });
          car!.lastSeenAt = Date.now();
          send(car!.ws, { type: 'exec', id, cmd, timeoutMs });
        });
        const latencyMs = Date.now() - started;
        send(ws, { ...outcome, id });
        await audit({
          ...baseAudit,
          allowed: true,
          ok: !!outcome.ok,
          latencyMs,
          error: outcome.ok ? undefined : outcome.error,
        });
        broadcastSessions();
        return;
      }
    });

    const drop = (): void => {
      if (con) {
        consoles.delete(con);
        con = null;
      }
    };
    ws.on('close', drop);
    ws.on('error', () => {});
  }

  return { listSessions };
}
