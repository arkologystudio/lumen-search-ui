import { Component, h } from '@stencil/core';

@Component({
  tag: 'app-root',
  styleUrl: 'app-root.css',
  shadow: true,
})
export class AppRoot {
  render() {
    return (
      <div class="app-container">
        {/* The search bar will appear as a floating icon */}
        <div class="search-bar-container">
          <culturehack-search />
        </div>

        <main>{/* Your main content goes here */}</main>
      </div>
    );
  }
}
