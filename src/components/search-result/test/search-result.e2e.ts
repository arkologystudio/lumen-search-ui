import { newE2EPage } from '@stencil/core/testing';

describe('search-result', () => {
  it('renders', async () => {
    const page = await newE2EPage();
    await page.setContent('<search-result></search-result>');

    const element = await page.find('search-result');
    expect(element).toHaveClass('hydrated');
  });
});
