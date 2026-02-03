
let _cached;

/**
 * `utilDetect` detects things from the user's browser.
 * It returns an object with the following:
 * {
 *   support: true,                   // Is Rapid supported?  (basically - not Internet Explorer)
 *   browser: "Chrome",               // e.g. 'Edge','msie','Opera','Chrome','Safari','Firefox'
 *   version: "133.0",                // reported browser version
 *   languages: ['en-US'],            // Array sourced from `navigator.languages`
 *   host: "http://127.0.0.1:8080/",
 *   os: "mac",
 *   platform: "Macintosh",
 *   prefersColorScheme: 'light',         // 'light' or 'dark'
 *   prefersContrast: null,               // 'more', 'less', or `null`
 *   prefersReducedMotion: false,         // `true` or `false`
 *   prefersReducedTransparency: false    // `true` or `false`
 * }
 */
export function utilDetect(refresh) {
  if (_cached && !refresh) return _cached;
  _cached = {};

  const ua = navigator.userAgent;
  let m = null;

  /* Browser */
  m = ua.match(/(edg)\/?\s*(\.?\d+(\.\d+)*)/i);   // Edge
  if (m !== null) {
    _cached.browser = 'Edge';
    _cached.version = m[2];
  }
  if (!_cached.browser) {
    m = ua.match(/Trident\/.*rv:([0-9]{1,}[\.0-9]{0,})/i);   // IE11
    if (m !== null) {
      _cached.browser = 'msie';
      _cached.version = m[1];
    }
  }
  if (!_cached.browser) {
    m = ua.match(/(opr)\/?\s*(\.?\d+(\.\d+)*)/i);   // Opera 15+
    if (m !== null) {
      _cached.browser = 'Opera';
      _cached.version = m[2];
    }
  }
  if (!_cached.browser) {
    m = ua.match(/(opera|chrome|safari|firefox|msie)\/?\s*(\.?\d+(\.\d+)*)/i);
    if (m !== null) {
      _cached.browser = m[1];
      _cached.version = m[2];
      m = ua.match(/version\/([\.\d]+)/i);
      if (m !== null) _cached.version = m[1];
    }
  }
  if (!_cached.browser) {
    _cached.browser = navigator.appName;
    _cached.version = navigator.appVersion;
  }

  // Keep major.minor version only..
  _cached.version = _cached.version.split(/\W/).slice(0,2).join('.');

  if (_cached.browser.toLowerCase() === 'msie') {
    _cached.support = false;
  } else {
    _cached.support = true;
  }

  /* Platform */
  if (/Win/.test(ua)) {
    _cached.os = 'win';
    _cached.platform = 'Windows';
  } else if (/Mac/.test(ua)) {
    _cached.os = 'mac';
    _cached.platform = 'Macintosh';
  } else if (/X11/.test(ua) || /Linux/.test(ua)) {
    _cached.os = 'linux';
    _cached.platform = 'Linux';
  } else {
    _cached.os = 'win';
    _cached.platform = 'Unknown';
  }

  /* Locale */
  _cached.locales = navigator.languages.slice();  // shallow copy

  /* Host */
  let loc, origin, pathname;
  try {
    loc = window.top.location;
    origin = loc.origin;
    pathname = loc.pathname;
  } catch {
    loc = window.location;
    origin = loc.origin;
    pathname = loc.pathname;
  }

  if (!origin) {  // for unpatched IE11
    origin = loc.protocol + '//' + loc.hostname + (loc.port ? ':' + loc.port: '');
  }

  _cached.host = origin + pathname;

  _cached.prefersColorScheme = window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  _cached.prefersContrast = window.matchMedia?.('(prefers-contrast: more)').matches ? 'more'
    : window.matchMedia?.('(prefers-contrast: less)').matches ? 'less' : null;
  _cached.prefersReducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  _cached.prefersReducedTransparency = window.matchMedia?.('(prefers-reduced-transparency: reduce)').matches;

  return _cached;
}
