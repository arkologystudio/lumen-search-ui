import { Component, h, State } from '@stencil/core';
import { API_ROUTE } from '../../constants';
import { Env } from '@stencil/core';

/**
 * Define the structure of a single search result.
 * Adjust fields (title/snippet/etc.) to match your own API's response.
 */
interface SearchResult {
  id: string;
  title: string;
  content: string;
}

/**
 * Define the structure of the API's response if it returns a top-level
 * `results` array or something similar.
 */
interface SearchResponse {
  results: SearchResult[];
}

@Component({
  tag: 'search-bar',
  styleUrl: 'search-bar.css', // or remove if not needed
  scoped: true,
})
export class SearchBar {
  @State() query: string = '';
  @State() results: SearchResult[] = [];

  /**
   * We'll store a numeric ID for the debounce timer so we can clear it.
   */
  private debounceTimer?: number;

  /**
   * Handle input changes, reset any existing timers, and set a new one
   * that calls our actual search function after 1 second of no typing.
   */
  private handleInput: (event: Event) => void = event => {
    const inputEl = event.target as HTMLInputElement;
    this.query = inputEl.value;

    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    this.debounceTimer = window.setTimeout(this.performSearch, 1000);
  };

  /**
   * Perform the actual search by sending a POST request to our local
   * API endpoint (localhost:3000/api/embedding/search). This route and
   * payload structure can be adjusted as needed.
   */
  private performSearch: () => Promise<void> = async () => {
    // If the user typed nothing, reset the results.
    if (this.query.trim().length === 0) {
      this.results = [];
      return;
    }

    try {
      console.log('Performing search on endpoint: ', `${Env.API_URL}${API_ROUTE}`);
      const response = await fetch(`${Env.API_URL}${API_ROUTE}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query: this.query }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      // Cast the JSON response to our SearchResponse interface.
      const data = (await response.json()) as SearchResponse;
      this.results = data.results;
      console.log('Search results: ', this.results);
    } catch (error) {
      console.error('Search request failed:', error);
      this.results = [];
    }
  };

  render() {
    return (
      <div>
        <input type="text" value={this.query} onInput={this.handleInput} placeholder="Search Curriculum..." class="search-bar" />

        {this.results.map(item => (
          <div key={item.id}>
            <search-result resultId={item.id} resultTitle={item.title} resultSnippet={item.content} />
          </div>
        ))}
      </div>
    );
  }
}
