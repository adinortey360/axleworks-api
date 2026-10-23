/* Shop protocol verification - run with: npx tsx src/shopProtocol.test.ts */
import {
  idempotencyKey,
  mapCompletionToRecord,
  SHOP_PROTOCOL_VERSION,
  validateCompletion,
} from './shopProtocol';

let failures = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) console.log(`PASS  ${name}`);
  else {
    failures += 1;
    console.log(`FAIL  ${name}`, extra ?? '');
  }
}

const good = {
  protocol: SHOP_PROTOCOL_VERSION,
  shopJobId: 'INV-2026-1042',
  completedAt: '2026-10-23T14:00:00.000Z',
  vehicle: { vin: 'WVWZZZ1G0MW41HCYJ', mileageKm: 45230 },
  work: [
    { kind: 'oil_change', condition: 'clean', nextChangeMileage: 55000 },
    { kind: 'brake_pads', pads: { frontLeft: 90, frontRight: 90, rearLeft: 40, rearRight: 42 } },
    { kind: 'tires', tires: { frontLeft: { treadDepth: 6, pressure: 33, condition: 'good' } } },
    { kind: 'battery_test', voltage: 12.6, health: 'good' },
    { kind: 'coolant', level: 'full' },
  ],
  notes: 'Oil + filter, pads bedding-in done.',
  recommendations: ['Rotate tyres next visit'],
};

const v1 = validateCompletion(good);
check('valid oil-change payload passes', v1.errors.length === 0 && !!v1.value, v1.errors);
if (v1.value) {
  const patch = mapCompletionToRecord(v1.value);
  check('oil mapped full/clean/changed', (patch.oil as any)?.level === 'full' && (patch.oil as any)?.changed === true);
  check('next change mileage kept', (patch.oil as any)?.nextChangeMileage === 55000);
  check('pads mapped', (patch.brakePads as any)?.rearLeft === 40);
  check('tyre corner mapped', (patch.tires as any)?.frontLeft?.pressure === 33);
  check('battery mapped', (patch.battery as any)?.voltage === 12.6);
  check('mileage floored', patch.mileageAtService === 45230);
  check('notes + recommendations kept', patch.notes === good.notes && patch.recommendations?.length === 1);
}

check('wrong protocol version rejected', validateCompletion({ ...good, protocol: 'v0' }).errors.length > 0);
check('missing jobId rejected', validateCompletion({ ...good, shopJobId: '' }).errors.length > 0);
check('bad VIN rejected', validateCompletion({ ...good, vehicle: { vin: 'SHORT' } }).errors.length > 0);
check('unknown kind rejected', validateCompletion({ ...good, work: [{ kind: 'teleport' }] }).errors.length > 0);
check('stray field rejected', validateCompletion({ ...good, work: [{ kind: 'oil_change', octane: 99 }] }).errors.length > 0);
check('bad pad % rejected', validateCompletion({ ...good, work: [{ kind: 'brake_pads', pads: { frontLeft: 140 } }] }).errors.length > 0);
check('bad voltage rejected', validateCompletion({ ...good, work: [{ kind: 'battery_test', voltage: 48 }] }).errors.length > 0);
check('unknown corner rejected', validateCompletion({ ...good, work: [{ kind: 'tires', tires: { middle: {} } }] }).errors.length > 0);
check(
  'defaults applied on sparse oil_topup',
  (() => {
    const v = validateCompletion({ ...good, work: [{ kind: 'oil_topup' }] });
    if (!v.value) return false;
    const p = mapCompletionToRecord(v.value);
    return (p.oil as any)?.level === 'good' && (p.oil as any)?.changed === false;
  })()
);
check('battery_replace marks replaced+good', (() => {
  const v = validateCompletion({ ...good, work: [{ kind: 'battery_replace', voltage: 12.8 }] });
  if (!v.value) return false;
  const p = mapCompletionToRecord(v.value);
  return (p.battery as any)?.replaced === true && (p.battery as any)?.health === 'good';
})());
check('idempotency key stable + namespaced', idempotencyKey('  KwikFit ', 'INV-1') === 'kwikfit::INV-1');

if (failures > 0) {
  console.error(`${failures} check(s) failed`);
  process.exit(1);
}
console.log('shop protocol: all checks passed');
