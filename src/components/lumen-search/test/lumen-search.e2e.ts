import { newE2EPage } from '@stencil/core/testing';

describe('lumen-search', () => {
  it('renders', async () => {
    const page = await newE2EPage();
    await page.setContent('<lumen-search></lumen-search>');

    const element = await page.find('lumen-search');
    expect(element).toHaveClass('hydrated');
  });
});
