import { newSpecPage } from '@stencil/core/testing';
import { LumenSearch } from '../lumen-search';

describe('lumen-search', () => {
  it('renders', async () => {
    const page = await newSpecPage({
      components: [LumenSearch],
      html: `<lumen-search></lumen-search>`,
    });
    expect(page.root).toEqualHtml(`
      <lumen-search>
        <mock:shadow-root>
          <slot></slot>
        </mock:shadow-root>
      </lumen-search>
    `);
  });
});
