/* Vehicle shadow-sync verification - run with: npx tsx src/vehicleSync.test.ts */
import { mapSyncToVehicleDoc, validateVehicleLink, validateVehicleSync } from './vehicleSync';

let failures = 0;
function check(name: string, cond: boolean, extra?: unknown) {
  if (cond) console.log(`PASS  ${name}`);
  else {
    failures += 1;
    console.log(`FAIL  ${name}`, extra ?? '');
  }
}

const good = {
  clientId: 'c_abc123',
  make: 'Volkswagen',
  model: 'Golf GTI',
  year: 2021,
  vin: 'wvwzzz1g0mw41hcyj',
  plateNumber: ' GR-1234 ',
  mileageKm: undefined,
  mileage: 45230,
  fuelType: 'petrol',
  nickname: 'My Golf',
};

const v1 = validateVehicleSync(good);
check('valid sync payload passes', v1.errors.length === 0 && !!v1.value, v1.errors);
if (v1.value) {
  check('vin uppercased', v1.value.vin === 'WVWZZZ1G0MW41HCYJ', v1.value.vin);
  check('plate trimmed', v1.value.plateNumber === 'GR-1234', v1.value.plateNumber);
  const doc = mapSyncToVehicleDoc(v1.value);
  check('doc mapped', doc.make === 'Volkswagen' && doc.year === 2021 && doc.mileage === 45230);
  check('plate mapped to licensePlate', doc.licensePlate === 'GR-1234');
}

check('missing clientId rejected', validateVehicleSync({ ...good, clientId: '' }).errors.length > 0);
check('missing make rejected', validateVehicleSync({ ...good, make: '' }).errors.length > 0);
check('bad year rejected', validateVehicleSync({ ...good, year: 1800 }).errors.length > 0);
check('bad vin rejected', validateVehicleSync({ ...good, vin: 'SHORT' }).errors.length > 0);
check('negative mileage rejected', validateVehicleSync({ ...good, mileage: -5 }).errors.length > 0);
check('empty vin allowed (manual cars)', validateVehicleSync({ ...good, vin: undefined }).errors.length === 0);

const l1 = validateVehicleLink({ clientIds: ['c_1', 'c_2', 'c_1'] });
check('link dedupes', !!l1.clientIds && l1.clientIds.length === 2, l1);
check('link empty rejected', validateVehicleLink({ clientIds: [] }).errors.length > 0);
check('link non-array rejected', validateVehicleLink({}).errors.length > 0);

if (failures > 0) {
  console.error(`${failures} check(s) failed`);
  process.exit(1);
}
console.log('vehicle sync: all checks passed');
