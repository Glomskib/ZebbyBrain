/**
 * Sanitize user-generated text content
 * - Strip all HTML tags
 * - Preserve line breaks for rendering as <br/>
 * - Return plain text only
 */
export function sanitizeText(text: string): string {
  if (!text) return '';
  
  // Remove all HTML tags
  let sanitized = text.replace(/<[^>]*>/g, '');
  
  // Trim excessive whitespace but preserve intentional line breaks
  sanitized = sanitized.trim();
  
  return sanitized;
}

/**
 * Convert URLs in text to clickable links with security attributes
 * Use this when rendering sanitized text
 */
export function linkifyText(text: string): string {
  if (!text) return '';
  
  // URL pattern
  const urlPattern = /(https?:\/\/[^\s]+)/g;
  
  return text.replace(urlPattern, (url) => {
    return `<a href="${url}" rel="nofollow noopener" target="_blank">${url}</a>`;
  });
}

/**
 * Convert line breaks to <br/> tags for HTML rendering
 */
export function nl2br(text: string): string {
  if (!text) return '';
  return text.replace(/\n/g, '<br/>');
}
