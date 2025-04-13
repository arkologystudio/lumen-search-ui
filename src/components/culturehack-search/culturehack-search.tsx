import { Component, h, State, Listen } from '@stencil/core';
import { API_ROUTE } from '../../constants';
import { Env } from '@stencil/core';

// Define a type for WordPress global settings
interface WindowWithWordPressSettings extends Window {
  CulturehackSearchSettings?: {
    api_url: string;
  };
}

interface MatchingBlock {
  blockId: string;
  content: string;
  score: number;
  url: string;
}
/**
 * Define the structure of a single search result.
 * Adjust fields (title/snippet/etc.) to match your own API's response.
 */

interface SearchResult {
  id: string;
  title: string;
  content: string;
  url: string;
  metadata: {
    matchingBlocks: MatchingBlock[];
  };
}

/**
 * Define the structure of the API's response if it returns a top-level
 * `results` array or something similar.
 */
// interface SearchResponse {
//   results: SearchResult[];
// }

/**
 * Gets the API URL from WordPress settings or falls back to environment variable
 */
const getApiUrl = (): string => {
  const win = window as WindowWithWordPressSettings;
  return win.CulturehackSearchSettings?.api_url || Env.API_URL || 'http://localhost:3000';
};

/**
 * Removes HTML tags and non-natural language characters from text
 */
const cleanTextContent = (text: string): string => {
  if (!text) return '';

  return (
    text
      // Remove HTML tags
      .replace(/<[^>]*>/g, ' ')
      // Replace HTML entities
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      // Remove other common entities
      .replace(/&[a-zA-Z0-9]+;/g, ' ')
      // Normalize whitespace (multiple spaces, newlines, tabs)
      .replace(/\s+/g, ' ')
      // Trim leading/trailing whitespace
      .trim()
  );
};

@Component({
  tag: 'culturehack-search',
  styleUrl: 'culturehack-search.css',
  shadow: true, // Use shadow DOM to isolate the component
})
export class CultureHackSearch {
  @State() query: string = '';
  @State() results: SearchResult[] = [];
  @State() isOpen: boolean = false;
  @State() isLoading: boolean = false;
  @State() hasSearched: boolean = false;

  /**
   * We'll store a numeric ID for the debounce timer so we can clear it.
   */
  private debounceTimer?: number;
  private inputRef?: HTMLInputElement;
  private modalRef?: HTMLDivElement;

  // Listen for global keyboard events when component loads
  @Listen('keydown', { target: 'window' })
  handleGlobalKeyDown(event: KeyboardEvent): void {
    // Check if "/" key is pressed to open search when not already open
    if (event.key === '/' && !this.isOpen && !this.isKeyboardEventInInput(event)) {
      event.preventDefault();
      this.toggleSearchModal();
    }

    // Check if Escape key is pressed to close search when open
    if (event.key === 'Escape' && this.isOpen) {
      this.closeModal();
    }
  }

  // Prevents opening search when typing in input fields
  private isKeyboardEventInInput(event: KeyboardEvent): boolean {
    const target = event.target as HTMLElement;
    return ['INPUT', 'TEXTAREA'].includes(target.tagName);
  }

  /**
   * Handle input changes, reset any existing timers, and set a new one
   * that calls our actual search function after 1 second of no typing.
   */
  private handleInput = (event: Event): void => {
    const inputEl = event.target as HTMLInputElement;
    this.query = inputEl.value;

    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    this.debounceTimer = window.setTimeout(this.performSearch, 500);
  };

  /**
   * Perform the actual search by sending a POST request to our local
   * API endpoint (localhost:3000/api/embedding/search). This route and
   * payload structure can be adjusted as needed.
   */
  private performSearch = async (): Promise<void> => {
    // If the user typed nothing, reset the results.
    if (this.query.trim().length === 0) {
      this.results = [];
      this.hasSearched = false;
      return;
    }

    try {
      this.isLoading = true;
      const apiUrl = getApiUrl();
      // Use API URL from WordPress settings if available, otherwise use API_ROUTE from constants
      const endpoint = apiUrl.includes('/api/embedding/search') ? apiUrl : `${apiUrl}${API_ROUTE}`;

      console.log('Performing search on endpoint: ', endpoint);
      const response = await fetch(endpoint, {
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
      const data = await response.json();
      console.log('Search results: ', data);
      this.results = data.results;
      this.hasSearched = true;
      console.log('Search results: ', this.results);
    } catch (error) {
      console.error('Search request failed:', error);
      this.results = [];
      this.hasSearched = true;
    } finally {
      this.isLoading = false;
    }
  };

  private toggleSearchModal = (): void => {
    this.isOpen = !this.isOpen;

    if (this.isOpen) {
      // Focus the input field when modal opens
      setTimeout(() => {
        if (this.inputRef) {
          this.inputRef.focus();
        }
      }, 100);

      // Add class to prevent scrolling on body
      document.body.classList.add('culturehack-search-modal-open');
    } else {
      // Remove class when modal closes
      document.body.classList.remove('culturehack-search-modal-open');
    }
  };

  private closeModal = (): void => {
    this.isOpen = false;
    this.query = '';
    this.results = [];
    this.hasSearched = false;
    document.body.classList.remove('culturehack-search-modal-open');
  };

  // Handle clicking outside to close the modal
  private handleBackdropClick = (event: MouseEvent): void => {
    if (this.modalRef && !this.modalRef.contains(event.target as Node)) {
      this.closeModal();
    }
  };

  disconnectedCallback() {
    // Ensure we remove the class if component is unmounted while modal is open
    document.body.classList.remove('culturehack-search-modal-open');
  }

  render() {
    // Count total results across all matching blocks
    const totalResultCount = this.results.reduce((count, result) => count + result.metadata.matchingBlocks.length, 0);
    console.log('Total result count: ', this.results);
    return (
      <div class="culturehack-search-container">
        {/* Search icon in the top right */}
        <div class="search-icon-container" onClick={this.toggleSearchModal}>
          <span class="search-text">Search Curriculum</span>

          <button class="search-icon-button" aria-label="Open search" title="Open search (press / to search)">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              width="18"
              height="18"
              fill="none"
              stroke="currentColor"
              stroke-width="1"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <circle cx="11" cy="11" r="8"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            </svg>
          </button>
        </div>

        {/* Search Modal */}
        {this.isOpen && (
          <div class="search-modal-backdrop" onClick={this.handleBackdropClick} role="dialog" aria-modal="true" aria-labelledby="search-modal-title">
            <div class="search-modal-content" ref={el => (this.modalRef = el as HTMLDivElement)}>
              <div class="search-modal-header">
                <div class="search-input-wrapper">
                  <svg
                    class="search-icon"
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    width="20"
                    height="20"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  >
                    <circle cx="11" cy="11" r="8"></circle>
                    <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                  </svg>

                  <input
                    type="text"
                    ref={el => (this.inputRef = el as HTMLInputElement)}
                    value={this.query}
                    onInput={this.handleInput}
                    placeholder="Search Curriculum..."
                    class="search-modal-input"
                    id="search-modal-title"
                  />
                </div>

                <button class="search-modal-close" onClick={this.closeModal} aria-label="Close search">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    width="24"
                    height="24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  >
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                  </svg>
                </button>
              </div>

              <div class="search-results-container">
                {this.isLoading ? (
                  <div class="search-loading">
                    <div class="search-loading-spinner"></div>
                    <p>Searching...</p>
                  </div>
                ) : (
                  <div class="search-results-content">
                    {this.hasSearched && this.query.trim().length > 0 && (
                      <div class="search-result-stats">
                        {totalResultCount > 0 ? (
                          <p>
                            Found {totalResultCount} results for "{this.query}"
                          </p>
                        ) : (
                          <p>No results found for "{this.query}"</p>
                        )}
                      </div>
                    )}

                    {this.results.map(item =>
                      item.metadata.matchingBlocks.map(block => (
                        <div key={block.blockId}>
                          <search-result resultId={block.blockId} resultTitle={item.title} resultSnippet={cleanTextContent(block.content)} resultUrl={item.url} />
                        </div>
                      )),
                    )}

                    {this.hasSearched && !this.isLoading && this.query.trim().length > 0 && totalResultCount === 0 && (
                      <div class="no-results">
                        <p>Try a different search term or check your spelling.</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }
}
