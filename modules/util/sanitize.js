import DOMPurify from 'dompurify';

/**
 * Sanitize HTML to prevent XSS attacks.
 * Uses DOMPurify with a safe default configuration.
 * This allows safe HTML tags through while stripping dangerous ones.
 *
 * @param {string} dirty - The untrusted HTML string to sanitize
 * @returns {string} The sanitized HTML string
 */
export function utilSanitizeHTML(dirty) {
  if (!dirty) return '';

  return DOMPurify.sanitize(dirty, {
    ALLOWED_TAGS: [
      'a', 'b', 'br', 'code', 'em', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'hr', 'i', 'img', 'li', 'mark', 'ol', 'option', 'p', 'pre', 'select',
      'small', 'span', 'strong', 'sub', 'sup', 'table', 'tbody', 'td', 'th',
      'thead', 'tr', 'u', 'ul'
    ],
    ALLOWED_ATTR: [
      'class', 'href', 'id', 'name', 'rel', 'src', 'target', 'title', 'alt',
      'value', 'data-osm-id', 'data-osm-type'
    ],
    ALLOW_DATA_ATTR: false,
    ADD_ATTR: ['target'],
    FORBID_TAGS: ['style', 'script', 'iframe', 'form', 'input', 'button'],
    FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'style']
  });
}
