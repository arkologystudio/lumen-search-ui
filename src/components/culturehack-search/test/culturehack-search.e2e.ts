import { newE2EPage } from '@stencil/core/testing';

describe('culturehack-search', () => {
  it('renders', async () => {
    const page = await newE2EPage();
    await page.setContent('<culturehack-search></culturehack-search>');

    const element = await page.find('culturehack-search');
    expect(element).toHaveClass('hydrated');
  });
});
