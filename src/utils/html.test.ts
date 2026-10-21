import { describe, it, expect } from 'vitest';
import { escapeHtml } from './html';

describe('escapeHtml', () => {
  it('escapa & < > " \'', () => {
    expect(escapeHtml(`<a href="x">Tom & 'Jerry'</a>`)).toBe(
      '&lt;a href=&quot;x&quot;&gt;Tom &amp; &#39;Jerry&#39;&lt;/a&gt;'
    );
  });
  it('não escapa duas vezes o que já escapou no mesmo passe e mantém texto simples', () => {
    expect(escapeHtml('Troca de óleo')).toBe('Troca de óleo');
    expect(escapeHtml('&amp;')).toBe('&amp;amp;');
    expect(escapeHtml('')).toBe('');
  });
});
