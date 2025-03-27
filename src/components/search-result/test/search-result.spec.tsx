import { newSpecPage } from '@stencil/core/testing';
import { SearchResult } from '../search-result';

describe('search-result', () => {
  it('renders', async () => {
    const page = await newSpecPage({
      components: [SearchResult],
      html: `<search-result></search-result>`,
    });
    expect(page.root).toEqualHtml(`
      <search-result>
        <mock:shadow-root>
          <slot></slot>
        </mock:shadow-root>
      </search-result>
    `);
  });
});
