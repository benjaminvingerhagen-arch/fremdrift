const routes = [];

// opts: { public: true } krever ikke innlogging, { admin: true } krever administrator.
export function route(method, pattern, handler, opts = {}) {
  const keys = [];
  const regex = new RegExp(
    '^' +
      pattern.replace(/\/:(\w+)/g, (_, key) => {
        keys.push(key);
        return '/([^/]+)';
      }) +
      '/?$',
  );
  routes.push({ method, regex, keys, handler, ...opts });
}

export function match(method, path) {
  let pathMatched = false;
  for (const r of routes) {
    const m = r.regex.exec(path);
    if (!m) continue;
    pathMatched = true;
    if (r.method !== method) continue;
    const params = {};
    try {
      r.keys.forEach((k, i) => {
        params[k] = decodeURIComponent(m[i + 1]);
      });
    } catch {
      // «/api/kunder/%» er ikke gyldig prosentkoding. Det er en adresse som ikke finnes, ikke en serverfeil.
      return null;
    }
    return { route: r, params };
  }
  return pathMatched ? { methodNotAllowed: true } : null;
}
