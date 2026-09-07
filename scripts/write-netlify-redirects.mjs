import { writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

// Netlify does not substitute $VARIABLE values in [[redirects]].
// Resolve the API origin at build time and keep requests same-origin for cookies.
export function apiRedirect(apiOrigin) {
  if (!apiOrigin)
    throw new Error('Set API_URL to the HTTPS API origin in Netlify build environment variables.');
  let url;
  try {
    url = new URL(apiOrigin);
  } catch {
    throw new Error('API_URL must be a valid HTTPS origin.');
  }
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== '/'
  ) {
    throw new Error(
      'API_URL must be an HTTPS origin without credentials, a path or query parameters.',
    );
  }
  return `/api/* ${url.origin}/api/:splat 200!\n`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await writeFile(
    new URL('../apps/web/dist/_redirects', import.meta.url),
    apiRedirect(process.env.API_URL),
  );
}
