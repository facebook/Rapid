

/**
 * FetchError
 * Pack up the parts of the response that we may need later for error handling.
 */
export class FetchError extends Error {
  constructor(response) {
    const message = response.status + ' ' + response.statusText;    // e.g. '404 Not Found'
    super(message);

    this.name = 'FetchError';
    this.status = response.status;
    this.statusText = response.statusText;
    this.response = response;   // make full response available, in case anyone wants it
  }
}


/**
 * fetchResponse
 * Handle the response from a `fetch`
 * d3-fetch previously did some of this for us, see https://github.com/d3/d3-fetch
 *
 * @example
 * fetch(resource, options)
 *   .then(utilFetchResponse)
 *   .then(result => … )
 *   .catch(err => {
 *      if (err.name === 'AbortError') return;  // ok, expected
 *      if (err.name === 'FetchError') …        // deal with error
 *   })
 *
 * @param    {Response}   The `Response` from a `fetch`
 * @returns  {*}          Result suitable to be returned to a `.then()` (a value or Promise)
 * @throws   {FetchError}
 */
export function utilFetchResponse(response) {
  if (!response.ok) {
    throw new FetchError(response);
  }

  const contentType = response.headers.get('content-type').split(';')[0];
  switch (contentType) {
    case 'application/json':
      if (response.status === 204 || response.status === 205) return;  // No Content, Reset Content
      return response.json();

    case 'text/html':
    case 'application/xml':
    case 'image/svg+xml':
      return response.text()
        .then(txt => new window.DOMParser().parseFromString(txt, contentType));

    default:
      return response.text();
  }
}
