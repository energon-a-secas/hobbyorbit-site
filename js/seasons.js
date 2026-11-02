// A device's time zone is a close match for its country, which is enough to
// label seasons. Nothing here leaves the device; the result is only a default
// the person can change in Settings.

// Southern-hemisphere zones that do not share a prefix. Equatorial zones follow
// the sign of their city's latitude.
const SOUTH_ZONES = new Set([
  'America/Santiago', 'America/Punta_Arenas', 'America/Buenos_Aires', 'America/Catamarca',
  'America/Cordoba', 'America/Jujuy', 'America/Mendoza', 'America/Rosario',
  'America/Montevideo', 'America/Asuncion', 'America/La_Paz', 'America/Lima',
  'America/Guayaquil', 'America/Sao_Paulo', 'America/Bahia', 'America/Fortaleza',
  'America/Recife', 'America/Belem', 'America/Maceio', 'America/Araguaina',
  'America/Cuiaba', 'America/Campo_Grande', 'America/Porto_Velho', 'America/Rio_Branco',
  'America/Eirunepe', 'America/Manaus', 'America/Noronha', 'America/Santarem', 'America/Porto_Acre',
  'Pacific/Auckland', 'Pacific/Chatham', 'Pacific/Fiji', 'Pacific/Tongatapu', 'Pacific/Apia',
  'Pacific/Noumea', 'Pacific/Efate', 'Pacific/Rarotonga', 'Pacific/Tahiti', 'Pacific/Port_Moresby',
  'Pacific/Bougainville', 'Pacific/Guadalcanal', 'Pacific/Norfolk', 'Pacific/Easter',
  'Pacific/Galapagos', 'Pacific/Fakaofo', 'Pacific/Funafuti', 'Pacific/Nauru', 'Pacific/Niue',
  'Pacific/Pitcairn', 'Pacific/Gambier', 'Pacific/Marquesas', 'Pacific/Wallis', 'Pacific/Pago_Pago',
  'Africa/Johannesburg', 'Africa/Maseru', 'Africa/Mbabane', 'Africa/Windhoek', 'Africa/Gaborone',
  'Africa/Harare', 'Africa/Lusaka', 'Africa/Maputo', 'Africa/Blantyre', 'Africa/Lubumbashi',
  'Africa/Luanda', 'Africa/Dar_es_Salaam', 'Africa/Nairobi', 'Africa/Kigali', 'Africa/Bujumbura',
  'Africa/Kinshasa', 'Africa/Brazzaville',
  'Indian/Antananarivo', 'Indian/Mauritius', 'Indian/Reunion', 'Indian/Mayotte', 'Indian/Comoro',
  'Indian/Chagos', 'Indian/Cocos', 'Indian/Christmas', 'Indian/Kerguelen', 'Indian/Mahe',
  'Asia/Jakarta', 'Asia/Makassar', 'Asia/Jayapura', 'Asia/Dili', 'Asia/Pontianak',
  'Atlantic/St_Helena', 'Atlantic/South_Georgia', 'Atlantic/Stanley',
  'NZ', 'NZ-CHAT', 'Chile/Continental', 'Chile/EasterIsland',
  'Brazil/East', 'Brazil/West', 'Brazil/Acre', 'Brazil/DeNoronha',
]);
const SOUTH_PREFIXES = ['Australia/', 'Antarctica/', 'America/Argentina/'];
// Used only when the time zone says nothing about place (UTC, Etc/…).
const SOUTH_REGIONS = new Set(['AO', 'AR', 'AU', 'BI', 'BO', 'BR', 'BW', 'CL', 'EC', 'FJ', 'ID',
  'KM', 'LS', 'MG', 'MU', 'MW', 'MZ', 'NA', 'NC', 'NZ', 'PE', 'PG', 'PY', 'RE', 'RW', 'SB', 'SZ',
  'TL', 'TO', 'TZ', 'UY', 'VU', 'WS', 'ZA', 'ZM', 'ZW']);

function placeOf(timeZone) {
  return timeZone.split('/').at(-1).replaceAll('_', ' ');
}

/** Returns { hemisphere, place } for a recognisable place, otherwise null. */
export function hemisphereFor(timeZone, locale = '') {
  if (typeof timeZone === 'string' && timeZone.includes('/') && !/^(Etc|UTC|GMT)\b/.test(timeZone)) {
    const south = SOUTH_ZONES.has(timeZone) || SOUTH_PREFIXES.some(prefix => timeZone.startsWith(prefix));
    return { hemisphere: south ? 'south' : 'north', place: placeOf(timeZone) };
  }
  if (typeof timeZone === 'string' && SOUTH_ZONES.has(timeZone)) {
    return { hemisphere: 'south', place: placeOf(timeZone) };
  }
  let region = '';
  // Only a region the locale states (es-CL), never one guessed from the language.
  try { region = new Intl.Locale(locale).region ?? ''; } catch { return null; }
  if (!/^[A-Z]{2}$/.test(region)) return null;
  let place = region;
  try { place = new Intl.DisplayNames(['en'], { type: 'region' }).of(region) ?? region; } catch { /* Keep the code. */ }
  return { hemisphere: SOUTH_REGIONS.has(region) ? 'south' : 'north', place };
}

export function detectHemisphere() {
  try {
    return hemisphereFor(Intl.DateTimeFormat().resolvedOptions().timeZone, globalThis.navigator?.language ?? '');
  } catch {
    return null;
  }
}
