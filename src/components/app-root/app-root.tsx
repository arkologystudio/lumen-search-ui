import { Component, h } from '@stencil/core';

@Component({
  tag: 'app-root',
  styleUrl: 'app-root.css',
  shadow: true,
})
export class AppRoot {
  render() {
    return (
      <div>
        <main>
          <div class="search-bar-container">
            <search-bar />
          </div>
        </main>
      </div>
    );
  }
}
