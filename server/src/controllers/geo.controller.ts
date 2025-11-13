import type { Request, Response } from 'express';

import { env } from '../config/env';

const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org';
const CONTACT_EMAIL = env.NOMINATIM_EMAIL ?? 'support@helphublocal.com';
const USER_AGENT =
  env.NOMINATIM_USER_AGENT ?? `HelpHub Local Server (contact: ${CONTACT_EMAIL})`;
const ACCEPT_LANGUAGE = env.NOMINATIM_LANGUAGE ?? 'he,en';

const DEFAULT_HEADERS = {
  'User-Agent': USER_AGENT,
  Accept: 'application/json'
} as const;

function collectParams(query: Request['query'], allowed: string[]): URLSearchParams {
  const params = new URLSearchParams();
  const source = query as Record<string, unknown>;

  for (const key of allowed) {
    const raw = source[key];
    if (raw === undefined || raw === null) continue;
    if (Array.isArray(raw)) {
      const last = raw.at(-1);
      if (last !== undefined && last !== null && last !== '') {
        params.set(key, String(last));
      }
    } else if (raw !== '') {
      params.set(key, String(raw));
    }
  }

  params.set('format', 'jsonv2');
  params.set('email', CONTACT_EMAIL);
  params.set('accept-language', ACCEPT_LANGUAGE);

  return params;
}

async function forwardToNominatim(
  res: Response,
  endpoint: 'search' | 'reverse',
  params: URLSearchParams
) {
  const url = new URL(`${NOMINATIM_BASE}/${endpoint}`);
  params.forEach((value, key) => {
    url.searchParams.set(key, value);
  });

  try {
    const response = await fetch(url.toString(), {
      headers: DEFAULT_HEADERS
    });

    if (!response.ok) {
      const text = await response.text();
      const message =
        text?.trim() ||
        `Nominatim error: ${response.status} ${response.statusText || 'Unknown error'}`;
      return res.status(response.status).json({ message });
    }

    const data = await response.json();
    res.setHeader('Cache-Control', 'public, max-age=300');
    return res.json(data);
  } catch (error) {
    console.error('[geo] nominatim request failed', error);
    return res
      .status(502)
      .json({ message: 'Unable to reach the geocoding service. Please try again later.' });
  }
}

export async function searchGeocodeHandler(req: Request, res: Response) {
  const params = collectParams(req.query, [
    'q',
    'limit',
    'countrycodes',
    'addressdetails',
    'viewbox',
    'bounded',
    'city',
    'street',
    'postalcode',
    'extratags',
    'namedetails'
  ]);

  if (!params.has('q')) {
    return res.status(400).json({ message: 'Missing query parameter "q".' });
  }

  if (!params.has('limit')) {
    params.set('limit', '5');
  }

  return forwardToNominatim(res, 'search', params);
}

export async function reverseGeocodeHandler(req: Request, res: Response) {
  const params = collectParams(req.query, ['lat', 'lon', 'addressdetails', 'zoom']);

  if (!params.has('lat') || !params.has('lon')) {
    return res
      .status(400)
      .json({ message: 'Missing required parameters "lat" and "lon".' });
  }

  return forwardToNominatim(res, 'reverse', params);
}


