// server/metaGeoTargeting.js
// Shared helpers for resolving free-text location input (zip codes, city names,
// "City, ST") into Meta's adgeolocation targeting keys, and for reading/writing
// an ad set's geo_locations without clobbering its other targeting fields.
'use strict';

const axios = require('axios');
const { META_API_VERSION } = require('./metaConfig');

const US_STATE_ABBR = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California',
  CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', FL: 'Florida', GA: 'Georgia',
  HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa',
  KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland',
  MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri',
  MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey',
  NM: 'New Mexico', NY: 'New York', NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio',
  OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina',
  SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont',
  VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming',
  DC: 'District of Columbia',
};

function splitCityState(raw) {
  const parts = String(raw || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (parts.length >= 2) {
    const city = parts[0];
    const stateRaw = parts[1];
    const abbr = stateRaw.toUpperCase().replace(/[^A-Z]/g, '');
    const stateFullName = US_STATE_ABBR[abbr] || stateRaw;
    return { city, stateFullName };
  }
  return { city: parts[0] || '', stateFullName: '' };
}

/**
 * Resolve one raw location string (a 5-digit zip, or a city / "City, ST") into a
 * Meta adgeolocation search match. Returns null if nothing usable was found.
 */
async function resolveOneLocation(rawInput, userToken) {
  const raw = String(rawInput || '').trim();
  if (!raw) return null;

  const isZip = /^\d{5}$/.test(raw);

  try {
    if (isZip) {
      const res = await axios.get(`https://graph.facebook.com/${META_API_VERSION}/search`, {
        params: {
          access_token: userToken,
          type: 'adgeolocation',
          q: raw,
          location_types: JSON.stringify(['zip']),
          country_code: 'US',
          limit: 10,
        },
        timeout: 8000,
      });
      const data = res.data?.data || [];
      const match = data.find((item) =>
        String(item.type || '').toLowerCase() === 'zip' &&
        String(item.name || '').trim() === raw
      ) || data.find((item) => String(item.type || '').toLowerCase() === 'zip') || null;
      if (!match?.key) return null;
      return { input: raw, type: 'zip', key: String(match.key), name: match.name || raw, region: match.region || '' };
    }

    const { city, stateFullName } = splitCityState(raw);
    if (!city) return null;

    const res = await axios.get(`https://graph.facebook.com/${META_API_VERSION}/search`, {
      params: {
        access_token: userToken,
        type: 'adgeolocation',
        q: city,
        location_types: JSON.stringify(['city']),
        country_code: 'US',
        limit: 10,
      },
      timeout: 8000,
    });
    const data = res.data?.data || [];

    const match =
      // Pass 1: exact city + state match
      (stateFullName && data.find((item) =>
        String(item.type || '').toLowerCase() === 'city' &&
        String(item.country_code || '').toUpperCase() === 'US' &&
        String(item.name || '').toLowerCase() === city.toLowerCase() &&
        String(item.region || '').toLowerCase().includes(stateFullName.toLowerCase())
      )) ||
      // Pass 2: city name only, US
      data.find((item) =>
        String(item.type || '').toLowerCase() === 'city' &&
        String(item.country_code || '').toUpperCase() === 'US' &&
        String(item.name || '').toLowerCase() === city.toLowerCase()
      ) ||
      null; // never fall back to data[0] — risk of matching the wrong city/country

    if (!match?.key) return null;
    return { input: raw, type: 'city', key: String(match.key), name: match.name || city, region: match.region || '' };
  } catch (err) {
    console.warn('[metaGeoTargeting] resolveOneLocation failed', { raw, error: err?.response?.data?.error?.message || err?.message });
    return null;
  }
}

/**
 * Resolve a list of raw location strings into a Meta geo_locations object.
 * Returns { geoLocations, resolved, failed } — resolved/failed are per-input so
 * the caller can tell the user exactly which entries didn't match anything.
 */
async function resolveLocationsToGeoTargeting(rawLocations, userToken) {
  const inputs = (Array.isArray(rawLocations) ? rawLocations : [])
    .map((s) => String(s || '').trim())
    .filter(Boolean);

  const resolved = [];
  const failed = [];

  for (const raw of inputs) {
    const match = await resolveOneLocation(raw, userToken);
    if (match) resolved.push(match);
    else failed.push({ input: raw, reason: 'No matching Meta location found for this zip/city.' });
  }

  const zips = resolved.filter((r) => r.type === 'zip').map((r) => ({ key: r.key }));
  const cities = resolved.filter((r) => r.type === 'city').map((r) => ({ key: r.key, radius: 25, distance_unit: 'mile' }));

  const geoLocations = {};
  if (zips.length) geoLocations.zips = zips;
  if (cities.length) geoLocations.cities = cities;

  return { geoLocations, resolved, failed };
}

/** Human-readable summary of a Meta geo_locations object for display in the UI. */
function describeGeoLocations(geo) {
  if (!geo || typeof geo !== 'object') return 'Not set';
  const parts = [];
  if (Array.isArray(geo.zips) && geo.zips.length) {
    parts.push(...geo.zips.map((z) => z.name || z.key));
  }
  if (Array.isArray(geo.cities) && geo.cities.length) {
    parts.push(...geo.cities.map((c) => (c.name ? `${c.name} (${c.radius || 25}mi)` : c.key)));
  }
  if (Array.isArray(geo.regions) && geo.regions.length) {
    parts.push(...geo.regions.map((r) => r.name || r.key));
  }
  if (Array.isArray(geo.countries) && geo.countries.length && !parts.length) {
    return geo.countries.includes('US') && geo.countries.length === 1
      ? 'Entire United States'
      : geo.countries.join(', ');
  }
  return parts.length ? parts.join(', ') : 'Not set';
}

/**
 * Fetch the ad set's full current targeting object from Meta (needed so an update
 * can merge in new geo_locations without wiping age range / interests / etc.).
 */
async function fetchAdsetTargeting(adsetId, userToken) {
  const res = await axios.get(`https://graph.facebook.com/${META_API_VERSION}/${adsetId}`, {
    params: { access_token: userToken, fields: 'id,targeting' },
    timeout: 10000,
  });
  return res.data?.targeting || {};
}

/**
 * Apply new geo_locations to an ad set, preserving every other targeting field
 * (age range, interests, etc.) by fetching the current targeting first and
 * merging — sending a partial `targeting` object to Meta replaces the whole
 * spec, not just the fields you include.
 */
async function applyGeoLocationsToAdset(adsetId, geoLocations, userToken) {
  const currentTargeting = await fetchAdsetTargeting(adsetId, userToken);
  const mergedTargeting = {
    ...currentTargeting,
    geo_locations: geoLocations,
  };
  await axios.post(
    `https://graph.facebook.com/${META_API_VERSION}/${adsetId}`,
    { targeting: mergedTargeting },
    { params: { access_token: userToken }, timeout: 15000 }
  );
  return mergedTargeting;
}

module.exports = {
  resolveOneLocation,
  resolveLocationsToGeoTargeting,
  describeGeoLocations,
  fetchAdsetTargeting,
  applyGeoLocationsToAdset,
};
