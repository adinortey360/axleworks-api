# AxleWorks Shop Completion Protocol v1

## Why this exists

Fluid levels, pad thickness, tyre condition, battery health, filter state:
none of these are readable through generic OBD, so the app can only show
them from **workshop service records**. Until now the only way a record got
in was an admin typing it into the back office - which means after a real
oil change at a real shop, the app still showed stale data.

This protocol lets a mechanic shop report finished work straight into the
system the moment the job is done. The next time the driver opens the car
page, Fluids / Brakes / Battery show the fresh values with the shop's name
on them.

## Authentication

Shops authenticate with a per-shop API key in the `X-Shop-Key` header.
Keys are issued out-of-band and configured on the server:

```
SHOP_API_KEYS="KwikFit Gh:super-secret-1,AutoGym:super-secret-2"
```

Secrets are SHA-256 hashed in memory and compared in constant time.
`401` = missing/invalid key.

## Endpoint

`POST /api/v1/shop/completions`

## Request body

```json
{
  "protocol": "axleworks.service-completion/v1",
  "shopJobId": "INV-2026-1042",
  "completedAt": "2026-10-23T14:00:00.000Z",
  "vehicle": { "vin": "WVWZZZ1G0MW41HCYJ", "mileageKm": 45230 },
  "work": [
    { "kind": "oil_change", "condition": "clean", "nextChangeMileage": 55000 },
    { "kind": "brake_pads", "pads": { "frontLeft": 90, "frontRight": 90, "rearLeft": 40, "rearRight": 42 } }
  ],
  "notes": "Oil + filter. Pads bedding-in done.",
  "recommendations": ["Rotate tyres next visit"]
}
```

- `protocol` must be exactly `axleworks.service-completion/v1` (version gate).
- `shopJobId` is **required** and is the idempotency key: resubmitting the
  same job returns the original record instead of creating a duplicate.
- `completedAt` is optional (defaults to receipt time).
- `vehicle.vin` (11-17 chars) is matched case-insensitively against
  registered vehicles. Unknown VIN → `404`, nothing is stored.
- `vehicle.mileageKm` (optional) bumps the vehicle's odometer if higher.
- `work` is 1-40 items. Unknown kinds, unknown fields, and out-of-range
  values are rejected with `400` + a per-item `details` list.

## Work item kinds

| kind | Meaning | Accepted fields |
|---|---|---|
| `oil_change` | Oil + filter changed | `condition`, `nextChangeMileage` (level implied `full`) |
| `oil_topup` | Oil topped up | `level`, `condition` |
| `brake_fluid` | Brake fluid serviced | `level`, `condition`, `changed` |
| `transmission_fluid` | Transmission fluid serviced | `level`, `condition`, `changed` |
| `coolant` | Coolant serviced | `level`, `condition`, `changed` |
| `power_steering_fluid` | PS fluid serviced | `level`, `changed` |
| `brake_pads` | Pad measurement/replacement | `pads: {corner: 0-100}` |
| `tires` | Tyre check/rotation/replacement | `tires: {corner: {treadDepthMm, pressurePsi, condition}}` |
| `battery_test` | Battery tested | `voltage`, `health` |
| `battery_replace` | Battery replaced | `voltage` (health implied `good`) |
| `air_filter` | Engine air filter | `condition`, `replaced` |
| `cabin_air_filter` | Cabin air filter | `condition`, `replaced` |
| `wipers` | Wipers | `wipers: {front, rear}`, `replaced` |

Levels: `full | good | low | critical`. Corners: `frontLeft`,
`frontRight`, `rearLeft`, `rearRight`. Any field not listed for a kind is
rejected so typos fail loudly instead of silently dropping data.

## Responses

- `201 { success, duplicate: false, recordId, vehicleId }` - recorded.
- `200 { success, duplicate: true, ... }` - same `shopJobId` seen before.
- `400 { success: false, error, details[] }` - validation failed.
- `401` - bad/missing shop key. `404` - VIN not registered.

## Example

```bash
curl -X POST https://api.axleworks.app/api/v1/shop/completions \
  -H 'Content-Type: application/json' \
  -H 'X-Shop-Key: super-secret-1' \
  -d '{
    "protocol": "axleworks.service-completion/v1",
    "shopJobId": "INV-2026-1042",
    "vehicle": { "vin": "WVWZZZ1G0MW41HCYJ", "mileageKm": 45230 },
    "work": [{ "kind": "oil_change", "nextChangeMileage": 55000 }]
  }'
```

## App pickup

The phone app reads the latest record via
`GET /auth/vehicles/:id/service-data` (unchanged), which now also returns
`source` (`manual` | `shop`) and `shopName`. The car page re-fetches this
on every visit, so a shop submission shows up without the user doing
anything. The Fluids sheet marks shop-reported levels the same way it
marks manual service records.
