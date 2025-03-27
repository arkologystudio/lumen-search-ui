import { newSpecPage } from '@stencil/core/testing';
import { SearchBar } from '../search-bar';

describe('search-bar', () => {
  it('renders', async () => {
    const page = await newSpecPage({
      components: [SearchBar],
      html: `<search-bar></search-bar>`,
    });
    expect(page.root).toEqualHtml(`
      <search-bar>
        <mock:shadow-root>
          <slot></slot>
        </mock:shadow-root>
      </search-bar>
    `);
  });
});
