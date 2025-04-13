import { newSpecPage } from '@stencil/core/testing';
import { CultureHackSearch } from '../culturehack-search';

describe('culturehack-search', () => {
  it('renders', async () => {
    const page = await newSpecPage({
      components: [CultureHackSearch],
      html: `<culturehack-search></culturehack-search>`,
    });
    expect(page.root).toEqualHtml(`
      <culturehack-search>
        <mock:shadow-root>
          <slot></slot>
        </mock:shadow-root>
      </culturehack-search>
    `);
  });
});
