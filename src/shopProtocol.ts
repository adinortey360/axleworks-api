/**
 * AxleWorks Shop Completion Protocol v1.
 *
 * Problem: fluid levels, pad thickness, tyre condition, battery health and
 * the like are NOT readable through generic OBD, so the app can only show
 * them from workshop service records. Until now the only way a record got
 * in was an admin typing it into the back office.
 *
 * This module defines the contract a mechanic shop uses to report finished
 * work straight into the system:
 *
 *   POST /api/v1/shop/completions   (header: X-Shop-Key)
 *   {
 *     "protocol": "axleworks.service-completion/v1",
 *     "shopJobId": "SHOP-INV-12345",          // idempotency key (required)
 *     "completedAt": "2026-10-23T14:00:00Z",  // optional, defaults to now
 *     "vehicle": { "vin": "WVWZZZ...", "mileageKm": 45230 },
 *     "work": [ { "kind": "oil_change", ... }, ... ],
 *     "notes": "optional free text",
 *     "recommendations": ["optional strings"]
 *   }
 *
 * The endpoint matches `vehicle.vin` (case-insensitive) to a registered
 * vehicle, creates one ServiceRecord covering exactly the reported work,
 * and the phone app picks it up on its next service-data fetch - so the
 * Fluids / Brakes / Battery sheets stay truthful without any OBD support.
 *
 * Everything in this file is pure (no mongoose, no express) so it can be
 * unit-tested without a database.
 */

export const SHOP_PROTOCOL_VERSION = 'axleworks.service-completion/v1';

export type FluidLevel = 'full' | 'good' | 'low' | 'critical' | 'not_checked';
export type WorkKind =
  | 'oil_change'
  | 'oil_topup'
  | 'brake_fluid'
  | 'transmission_fluid'
  | 'coolant'
  | 'power_steering_fluid'
  | 'brake_pads'
  | 'tires'
  | 'battery_test'
  | 'battery_replace'
  | 'air_filter'
  | 'cabin_air_filter'
  | 'wipers';

const WORK_KINDS: WorkKind[] = [
  'oil_change',
  'oil_topup',
  'brake_fluid',
  'transmission_fluid',
  'coolant',
  'power_steering_fluid',
  'brake_pads',
  'tires',
  'battery_test',
  'battery_replace',
  'air_filter',
  'cabin_air_filter',
  'wipers',
];

const FLUID_LEVELS: FluidLevel[] = ['full', 'good', 'low', 'critical', 'not_checked'];

// Which scalar fields each kind accepts. Anything else on the item is
// rejected so typos fail loudly instead of silently dropping data.
const KIND_FIELDS: Record<WorkKind, string[]> = {
  oil_change: ['condition', 'nextChangeMileage'],
  oil_topup: ['level', 'condition'],
  brake_fluid: ['level', 'condition', 'changed'],
  transmission_fluid: ['level', 'condition', 'changed'],
  coolant: ['level', 'condition', 'changed'],
  power_steering_fluid: ['level', 'changed'],
  brake_pads: ['pads'],
  tires: ['tires'],
  battery_test: ['voltage', 'health'],
  battery_replace: ['voltage'],
  air_filter: ['condition', 'replaced'],
  cabin_air_filter: ['condition', 'replaced'],
  wipers: ['wipers', 'replaced'],
};

const FLUID_CONDITIONS = ['clean', 'good', 'dirty', 'very_dirty', 'contaminated', 'burnt', 'not_checked'];
const FILTER_CONDITIONS = ['clean', 'good', 'dirty', 'replace', 'not_checked'];
const BATTERY_HEALTH = ['good', 'fair', 'weak', 'replace', 'not_checked'];
const TIRE_CONDITIONS = ['good', 'fair', 'worn', 'replace', 'not_checked'];
const WIPER_CONDITIONS = ['good', 'fair', 'streaking', 'replace', 'not_checked', 'n/a'];

const CORNERS = ['frontLeft', 'frontRight', 'rearLeft', 'rearRight'] as const;

export interface ShopWorkItem {
  kind: WorkKind;
  level?: FluidLevel;
  condition?: string;
  changed?: boolean;
  nextChangeMileage?: number;
  voltage?: number;
  health?: string;
  replaced?: boolean;
  pads?: Partial<Record<(typeof CORNERS)[number], number>>;
  tires?: Partial<
    Record<(typeof CORNERS)[number], { treadDepth?: number; pressure?: number; condition?: string }>
  >;
  wipers?: { front?: string; rear?: string };
}

export interface ShopCompletionPayload {
  protocol: string;
  shopJobId: string;
  completedAt?: string;
  vehicle: { vin: string; mileageKm?: number };
  work: ShopWorkItem[];
  notes?: string;
  recommendations?: string[];
}

export interface CompletionRecordPatch {
  serviceDate: Date;
  mileageAtService?: number;
  notes?: string;
  recommendations?: string[];
  oil?: Record<string, unknown>;
  brakeFluid?: Record<string, unknown>;
  transmissionFluid?: Record<string, unknown>;
  coolant?: Record<string, unknown>;
  powerSteeringFluid?: Record<string, unknown>;
  brakePads?: Record<string, unknown>;
  tires?: Record<string, unknown>;
  battery?: Record<string, unknown>;
  airFilter?: Record<string, unknown>;
  cabinAirFilter?: Record<string, unknown>;
  wipers?: Record<string, unknown>;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isVin(v: unknown): v is string {
  return typeof v === 'string' && /^[A-HJ-NPR-Z0-9]{11,17}$/i.test(v.trim());
}

/**
 * Validate an unknown body against the protocol. Returns the typed payload
 * or a list of human-readable problems (empty value + problems = invalid).
 */
export function validateCompletion(body: unknown): { value?: ShopCompletionPayload; errors: string[] } {
  const errors: string[] = [];
  if (!isRecord(body)) return { errors: ['body must be a JSON object'] };

  if (body.protocol !== SHOP_PROTOCOL_VERSION) {
    errors.push(`protocol must be exactly "${SHOP_PROTOCOL_VERSION}"`);
  }
  if (typeof body.shopJobId !== 'string' || body.shopJobId.trim().length === 0) {
    errors.push('shopJobId is required (idempotency key, e.g. the invoice number)');
  }
  if (body.completedAt !== undefined && Number.isNaN(Date.parse(String(body.completedAt)))) {
    errors.push('completedAt must be an ISO date string');
  }

  if (!isRecord(body.vehicle)) {
    errors.push('vehicle must be an object with vin');
  } else {
    if (!isVin(body.vehicle.vin)) errors.push('vehicle.vin must be an 11-17 character VIN');
    if (body.vehicle.mileageKm !== undefined) {
      const m = Number(body.vehicle.mileageKm);
      if (!Number.isFinite(m) || m < 0) errors.push('vehicle.mileageKm must be a non-negative number');
    }
  }

  if (!Array.isArray(body.work) || body.work.length === 0) {
    errors.push('work must be a non-empty array');
  } else if (body.work.length > 40) {
    errors.push('work accepts at most 40 items per completion');
  } else {
    body.work.forEach((item: unknown, i: number) => {
      const where = `work[${i}]`;
      if (!isRecord(item)) {
        errors.push(`${where} must be an object`);
        return;
      }
      if (typeof item.kind !== 'string' || !(WORK_KINDS as string[]).includes(item.kind)) {
        errors.push(`${where}.kind must be one of: ${WORK_KINDS.join(', ')}`);
        return;
      }
      const kind = item.kind as WorkKind;
      for (const key of Object.keys(item)) {
        if (key !== 'kind' && !KIND_FIELDS[kind].includes(key)) {
          errors.push(`${where}: field "${key}" is not valid for kind "${kind}"`);
        }
      }
      const level = item.level as unknown;
      if (level !== undefined && !(FLUID_LEVELS as string[]).includes(String(level))) {
        errors.push(`${where}.level must be one of: ${FLUID_LEVELS.join(', ')}`);
      }
      const condition = item.condition as unknown;
      if (
        condition !== undefined &&
        ![...FLUID_CONDITIONS, ...FILTER_CONDITIONS].includes(String(condition))
      ) {
        errors.push(`${where}.condition "${condition}" is not a known condition value`);
      }
      if (item.changed !== undefined && typeof item.changed !== 'boolean') {
        errors.push(`${where}.changed must be a boolean`);
      }
      if (item.nextChangeMileage !== undefined) {
        const n = Number(item.nextChangeMileage);
        if (!Number.isFinite(n) || n < 0) errors.push(`${where}.nextChangeMileage must be a non-negative number`);
      }
      if (item.voltage !== undefined) {
        const v = Number(item.voltage);
        if (!Number.isFinite(v) || v < 0 || v > 30) errors.push(`${where}.voltage must be 0-30 V`);
      }
      if (item.health !== undefined && !(BATTERY_HEALTH as string[]).includes(String(item.health))) {
        errors.push(`${where}.health must be one of: ${BATTERY_HEALTH.join(', ')}`);
      }
      if (item.replaced !== undefined && typeof item.replaced !== 'boolean') {
        errors.push(`${where}.replaced must be a boolean`);
      }
      if (item.pads !== undefined) {
        if (!isRecord(item.pads)) errors.push(`${where}.pads must be an object`);
        else {
          for (const [corner, pct] of Object.entries(item.pads)) {
            if (!(CORNERS as readonly string[]).includes(corner)) errors.push(`${where}.pads has unknown corner "${corner}"`);
            else if (typeof pct !== 'number' || pct < 0 || pct > 100) errors.push(`${where}.pads.${corner} must be 0-100 (% remaining)`);
          }
        }
      }
      if (item.tires !== undefined) {
        if (!isRecord(item.tires)) errors.push(`${where}.tires must be an object`);
        else {
          for (const [corner, t] of Object.entries(item.tires)) {
            if (!(CORNERS as readonly string[]).includes(corner)) {
              errors.push(`${where}.tires has unknown corner "${corner}"`);
              continue;
            }
            if (!isRecord(t)) {
              errors.push(`${where}.tires.${corner} must be an object`);
              continue;
            }
            if (t.treadDepth !== undefined && (typeof t.treadDepth !== 'number' || (t.treadDepth as number) < 0)) {
              errors.push(`${where}.tires.${corner}.treadDepth must be a non-negative number (mm)`);
            }
            if (t.pressure !== undefined && (typeof t.pressure !== 'number' || (t.pressure as number) < 0)) {
              errors.push(`${where}.tires.${corner}.pressure must be a non-negative number (PSI)`);
            }
            if (t.condition !== undefined && !(TIRE_CONDITIONS as string[]).includes(String(t.condition))) {
              errors.push(`${where}.tires.${corner}.condition must be one of: ${TIRE_CONDITIONS.join(', ')}`);
            }
          }
        }
      }
      if (item.wipers !== undefined) {
        if (!isRecord(item.wipers)) errors.push(`${where}.wipers must be an object`);
        else {
          for (const [pos, c] of Object.entries(item.wipers)) {
            if (pos !== 'front' && pos !== 'rear') errors.push(`${where}.wipers has unknown position "${pos}"`);
            else if (!(WIPER_CONDITIONS as string[]).includes(String(c))) {
              errors.push(`${where}.wipers.${pos} must be one of: ${WIPER_CONDITIONS.join(', ')}`);
            }
          }
        }
      }
    });
  }

  if (body.notes !== undefined && typeof body.notes !== 'string') errors.push('notes must be a string');
  if (body.recommendations !== undefined) {
    if (!Array.isArray(body.recommendations) || !(body.recommendations as unknown[]).every((r) => typeof r === 'string')) {
      errors.push('recommendations must be an array of strings');
    }
  }

  if (errors.length > 0) return { errors };
  return { value: body as unknown as ShopCompletionPayload, errors: [] };
}

/** Map a validated completion onto ServiceRecord fields. */
export function mapCompletionToRecord(payload: ShopCompletionPayload): CompletionRecordPatch {
  const patch: CompletionRecordPatch = {
    serviceDate: payload.completedAt ? new Date(payload.completedAt) : new Date(),
  };
  const mileage = payload.vehicle.mileageKm;
  if (typeof mileage === 'number') patch.mileageAtService = Math.floor(mileage);
  if (typeof payload.notes === 'string' && payload.notes.length > 0) patch.notes = payload.notes;
  if (payload.recommendations && payload.recommendations.length > 0) {
    patch.recommendations = [...payload.recommendations];
  }

  for (const item of payload.work) {
    switch (item.kind) {
      case 'oil_change':
        patch.oil = {
          level: 'full',
          condition: item.condition ?? 'clean',
          changed: true,
          ...(item.nextChangeMileage !== undefined ? { nextChangeMileage: Math.floor(item.nextChangeMileage) } : {}),
        };
        break;
      case 'oil_topup':
        patch.oil = {
          level: item.level ?? 'good',
          ...(item.condition !== undefined ? { condition: item.condition } : {}),
          changed: false,
        };
        break;
      case 'brake_fluid':
        patch.brakeFluid = {
          level: item.level ?? 'full',
          ...(item.condition !== undefined ? { condition: item.condition } : {}),
          changed: item.changed ?? true,
        };
        break;
      case 'transmission_fluid':
        patch.transmissionFluid = {
          level: item.level ?? 'full',
          ...(item.condition !== undefined ? { condition: item.condition } : {}),
          changed: item.changed ?? true,
        };
        break;
      case 'coolant':
        patch.coolant = {
          level: item.level ?? 'full',
          ...(item.condition !== undefined ? { condition: item.condition } : {}),
          changed: item.changed ?? true,
        };
        break;
      case 'power_steering_fluid':
        patch.powerSteeringFluid = { level: item.level ?? 'full', changed: item.changed ?? true };
        break;
      case 'brake_pads':
        patch.brakePads = { ...(item.pads ?? {}) };
        break;
      case 'tires':
        patch.tires = { ...(item.tires ?? {}) };
        break;
      case 'battery_test':
        patch.battery = {
          ...(item.voltage !== undefined ? { voltage: item.voltage } : {}),
          ...(item.health !== undefined ? { health: item.health } : {}),
          replaced: false,
        };
        break;
      case 'battery_replace':
        patch.battery = {
          ...(item.voltage !== undefined ? { voltage: item.voltage } : {}),
          health: 'good',
          replaced: true,
        };
        break;
      case 'air_filter':
        patch.airFilter = {
          condition: item.condition ?? (item.replaced ? 'clean' : 'good'),
          replaced: item.replaced ?? false,
        };
        break;
      case 'cabin_air_filter':
        patch.cabinAirFilter = {
          condition: item.condition ?? (item.replaced ? 'clean' : 'good'),
          replaced: item.replaced ?? false,
        };
        break;
      case 'wipers':
        patch.wipers = {
          ...(item.wipers ?? { front: 'good' }),
          replaced: item.replaced ?? false,
        };
        break;
    }
  }
  return patch;
}

/** Deterministic idempotency key so resubmits do not create duplicates. */
export function idempotencyKey(shopName: string, shopJobId: string): string {
  return `${shopName.toLowerCase().trim()}::${shopJobId.trim()}`;
}
