import { app } from "../server";

export default function handler(req: any, res: any) {
  try {
    const rawRoute = req.query?.__route;
    const matchedPath = req.headers?.['x-matched-path'];

    if (rawRoute) {
      const routeStr = Array.isArray(rawRoute) ? rawRoute.join('/') : String(rawRoute);
      const queryIdx = req.url ? req.url.indexOf('?') : -1;
      const queryPart = queryIdx !== -1 ? req.url.slice(queryIdx) : '';
      req.url = `/api/${routeStr}${queryPart}`;
    } else if (matchedPath && typeof matchedPath === 'string' && matchedPath.startsWith('/api/')) {
      const queryIdx = req.url ? req.url.indexOf('?') : -1;
      const queryPart = queryIdx !== -1 ? req.url.slice(queryIdx) : '';
      req.url = matchedPath.split('?')[0] + queryPart;
    }
  } catch (e) {
    console.warn("Vercel route normalize error:", e);
  }

  return app(req, res);
}

