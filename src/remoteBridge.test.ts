/* Remote bridge verification - run with: npx tsx src/remoteBridge.test.ts
 * Spins up the real relay on an ephemeral port with stub auth, drives a
 * fake car + fake console through it, and checks routing, the safety
 * filter, sessions listing and the audit trail (test database). */
import http from 'http';
import mongoose from 'mongoose';
import { WebSocket } from 'ws';
import { attachRemoteBridge, remoteCommandAllowed, RemoteCommand } from './remoteBridge';

let failures = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) console.log(`PASS  ${name}`);
  else {
    failures += 1;
    console.log(`FAIL  ${name}`, extra ?? '');
  }
}

// --- safety filter (pure, no I/O) -----------------------------------------
check('reads allowed', remoteCommandAllowed('22 1940').allowed);
check('mode 21 allowed', remoteCommandAllowed('21 62').allowed);
check('mode 2A allowed', remoteCommandAllowed('2A 2190').allowed);
check('mode 03 allowed', remoteCommandAllowed('03').allowed);
check('AT SH allowed', remoteCommandAllowed('AT SH 7E2').allowed);
check('AT CRA allowed', remoteCommandAllowed('AT CRA 641').allowed);
check('ATRV allowed', remoteCommandAllowed('ATRV').allowed);
check('ATZ allowed', remoteCommandAllowed('ATZ').allowed);
check('mode 04 blocked', !remoteCommandAllowed('04').allowed);
check('mode 08 blocked', !remoteCommandAllowed('08 00').allowed);
check('MA monitor blocked', !remoteCommandAllowed('AT MA').allowed);
check('UDS service blocked by default', !remoteCommandAllowed('10 03').allowed);
check('UDS tester-present blocked by default', !remoteCommandAllowed('3E 00').allowed);
check('FC blocked by default', !remoteCommandAllowed('AT FC SH 7E2').allowed);
check('raw mode allows UDS service', remoteCommandAllowed('10 03', true).allowed);
check('raw mode allows tester present', remoteCommandAllowed('3E 00', true).allowed);
check('raw mode allows FC setup', remoteCommandAllowed('AT FC SH 7E2', true).allowed);
check('raw mode still blocks 04', !remoteCommandAllowed('04', true).allowed);
check('raw mode still blocks 08', !remoteCommandAllowed('08 00', true).allowed);
check('raw mode still blocks MA', !remoteCommandAllowed('AT MA', true).allowed);
check('MR blocked', !remoteCommandAllowed('AT MR 7E8').allowed);
check('garbage blocked', !remoteCommandAllowed('HELLO CAR').allowed);
check('empty blocked', !remoteCommandAllowed('   ').allowed);

async function main(): Promise<void> {
  let dbUp = true;
  try {
    await mongoose.connect('mongodb://localhost:27017/axleworks-test', { serverSelectionTimeoutMS: 5000 });
    await RemoteCommand.deleteMany({ sessionId: /test-/ });
  } catch (e) {
    dbUp = false;
    console.log('SKIP  audit assertions (Mongo unavailable for tests:', (e as Error).message, ')');
  }

  const server = http.createServer();
  const bridge = attachRemoteBridge(server, {
    findSession: async (token: string) => {
      if (token === 'user-token') return { userId: 'u1', userType: 'user', label: '+233000111' };
      if (token === 'admin-token') return { userId: 'a1', userType: 'admin', label: 'admin@axleworks.com' };
      return null;
    },
  });
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as any).port;
  const url = (path: string) => `ws://127.0.0.1:${port}${path}`;

  const next = (ws: WebSocket, match?: (m: any) => boolean): Promise<any> =>
    new Promise((resolve, reject) => {
      const t = setTimeout(() => {
        ws.off('message', handler);
        ws.off('error', onError);
        reject(new Error('timed out waiting for message'));
      }, 8000);
      const handler = (d: any): void => {
        let m: any;
        try {
          m = JSON.parse(String(d));
        } catch {
          return;
        }
        if (match && !match(m)) return; // async broadcasts (sessions) pass through
        clearTimeout(t);
        ws.off('message', handler);
        ws.off('error', onError);
        resolve(m);
      };
      const onError = (e: unknown): void => {
        clearTimeout(t);
        ws.off('message', handler);
        reject(e);
      };
      ws.on('message', handler);
      ws.once('error', onError);
    });

  // Fake car: registers, answers execs with canned ELM replies.
  const car = new WebSocket(url('/ws/remote-car'));
  await new Promise<void>((resolve, reject) => {
    car.on('open', () => {
      car.send(JSON.stringify({ type: 'hello', role: 'car', token: 'user-token', vehicle: { clientId: 'c-test', make: 'Chevrolet', model: 'Sonic', year: 2013 } }));
      resolve();
    });
    car.on('error', reject);
  });
  car.on('message', (d) => {
    const m = JSON.parse(String(d));
    if (m.type === 'exec') {
      car.send(JSON.stringify({ type: 'result', id: m.id, ok: true, response: '62 5005 0ED5\r\r>' }));
    }
  });
  const welcome: any = await next(car);
  check('car registered', welcome.type === 'welcome' && !!welcome.sessionId, welcome);
  const sessionId: string = welcome.sessionId;

  // Fake console: admin auth, sessions list, exec round-trips.
  const con = new WebSocket(url('/ws/remote-console'));
  await new Promise<void>((resolve, reject) => {
    con.on('open', () => {
      con.send(JSON.stringify({ type: 'hello', role: 'console', token: 'admin-token' }));
      resolve();
    });
    con.on('error', reject);
  });
  const cwelcome: any = await next(con);
  check('console welcomed with session list', cwelcome.type === 'welcome' && Array.isArray(cwelcome.sessions), cwelcome);

  con.send(JSON.stringify({ type: 'sessions' }));
  const list: any = await next(con);
  check('console sees the car', list.sessions?.length === 1 && list.sessions[0].sessionId === sessionId, list);

  let seq = 0;
  const exec = async (cmd: string, extra: Record<string, unknown> = {}): Promise<any> => {
    const id = `t${++seq}`;
    con.send(JSON.stringify({ type: 'exec', id, sessionId, cmd, ...extra }));
    return next(con, (m) => m?.type === 'result' && m?.id === id);
  };

  const r1 = await exec('22 5005');
  check('allowed read round-trips', r1.ok === true && String(r1.response).replace(/\s/g, '').includes('625005'), r1);
  const r2 = await exec('04');
  check('mode 04 blocked with reason', r2.ok === false && /blocked/i.test(String(r2.error)), r2);
  const r3 = await exec('AT SH 241');
  check('AT SH passes through', r3.ok === true, r3);
  const r4 = await exec('22 5005', { sessionId: 'nope-missing' });
  check('unknown session errors', r4.ok === false && /no longer online/i.test(String(r4.error)), r4);

  // Raw CAN toggle: UDS service blocked before, passes after, 04 still blocked.
  const r5 = await exec('10 03');
  check('UDS rejected without raw mode', r5.ok === false && /blocked/i.test(String(r5.error)), r5);
  // Toggle acks carry no exec id (null), so they can't collide with results.
  const rawAck = (m: any) => m.type === 'result' && (m.id === null || m.id === undefined);
  con.send(JSON.stringify({ type: 'raw', sessionId }));
  const rRaw0 = await next(con, rawAck);
  check('raw toggle without flag is rejected', rRaw0.ok === false, rRaw0);
  con.send(JSON.stringify({ type: 'raw', sessionId, on: true }));
  const rRaw = await next(con, rawAck);
  check('raw toggle acknowledged', rRaw.ok === true && rRaw.raw === true, rRaw);
  const r6 = await exec('10 03');
  check('UDS passes in raw mode', r6.ok === true, r6);
  const r7 = await exec('04');
  check('mode 04 still blocked in raw mode', r7.ok === false, r7);
  con.send(JSON.stringify({ type: 'raw', sessionId, on: false }));
  await next(con);
  const r8 = await exec('10 03');
  check('UDS blocked again after raw off', r8.ok === false, r8);

  // Non-admin token must not attach a console.
  const bad = new WebSocket(url('/ws/remote-console'));
  const badOutcome: string = await new Promise((resolve) => {
    bad.on('open', () => bad.send(JSON.stringify({ type: 'hello', role: 'console', token: 'user-token' })));
    bad.on('message', (d) => resolve(String(d)));
    bad.on('close', () => resolve('closed'));
    setTimeout(() => resolve('timeout'), 5000);
  });
  check('console rejects non-admin token', /admin authorisation|closed/.test(badOutcome), badOutcome);
  bad.close();

  // Audit trail landed in Mongo (3 console execs above).
  if (dbUp) {
    await new Promise((r) => setTimeout(r, 500));
    const rows = await RemoteCommand.find({ sessionId }).lean();
    check('audit has the exec rows', rows.length === 3, rows.length);
    check('blocked row flagged', rows.some((r: any) => r.allowed === false && r.cmd === '04'), rows.map((r: any) => [r.cmd, r.allowed]));
  } else {
    console.log('SKIP  audit assertions (no Mongo)');
  }

  car.close();
  con.close();
  await new Promise((r) => setTimeout(r, 300));
  check('session removed after car drop', bridge.listSessions().length === 0);

  server.close();
  if (dbUp) await mongoose.disconnect();

  if (failures > 0) {
    console.error(`${failures} check(s) failed`);
    process.exit(1);
  }
  console.log('remote bridge: all checks passed');
}

main().catch((e) => {
  console.error('HARNESS ERROR', e);
  process.exit(1);
});
