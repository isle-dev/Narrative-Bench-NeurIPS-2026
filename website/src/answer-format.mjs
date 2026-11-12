import { Marked } from './vendor/marked.mjs';
import DOMPurify from './vendor/dompurify.mjs';

function asPlainText({ text }) {
  return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

const markdown = new Marked({ renderer: { html: asPlainText, image: asPlainText } });

export function formatAnswer(text) {
  return DOMPurify.sanitize(markdown.parse(text), {
    ALLOWED_TAGS: [
      'p', 'br', 'hr', 'strong', 'em', 'del', 'ul', 'ol', 'li', 'blockquote', 'code', 'pre',
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'table', 'thead', 'tbody', 'tr', 'th', 'td',
    ],
    ALLOWED_ATTR: [],
    ALLOW_ARIA_ATTR: false,
    ALLOW_DATA_ATTR: false,
    RETURN_DOM_FRAGMENT: true,
  });
}
