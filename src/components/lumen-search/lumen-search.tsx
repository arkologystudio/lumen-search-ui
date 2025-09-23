import { Component, h, State, Listen, Prop } from '@stencil/core';

// Define a type for WordPress global settings
interface WindowWithWordPressSettings extends Window {
  LumenSearchSettings?: {
    wp_rest_url?: string;
    site_id?: string;
    topK?: number;
    enable_placeholders?: boolean;
    placeholders?: Array<{
      title: string;
      subtitle: string;
    }>;
    ui_styles?: any;
    // Azure AI Search settings
    content_type?: 'posts' | 'products' | 'all';
    // Product search settings
    enable_faceted_search?: boolean;
    facet_config?: {
      brand?: boolean;
      category?: boolean;
      price?: boolean;
      rating?: boolean;
      availability?: boolean;
    };
    available_facets?: {
      brands: string[];
      categories: string[];
      price_range: { min: number; max: number };
    };
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
  type?: 'post' | 'product'; // Added to distinguish between content types
  metadata: {
    matchingBlocks: MatchingBlock[];
  };
  // Product-specific fields (optional)
  productData?: {
    price: string;
    image: string;
    rating: number;
    inStock: boolean;
    category: string;
    brand: string;
  };
}

// Interface for the lightweight search response from embedding service (knowledge posts)
interface EmbeddingSearchResponse {
  success: boolean;
  results: Array<{
    postId?: string; // Optional for backward compatibility
    postTitle?: string;
    postUrl?: string;
    // Product fields (when searching products)
    id?: string | number;
    title?: string;
    url?: string;
    type?: 'post' | 'product';
    content?: string;
    price?: string;
    image?: string;
    rating?: number;
    in_stock?: boolean;
    category?: string;
    brand?: string;
    siteId?: string;
    averageScore?: number;
    maxScore?: number;
    totalChunks?: number;
    similarity?: number; // Product search uses similarity score
    score?: number; // Alternative score field
    // For knowledge posts with chunks
    chunks?: Array<{
      chunkId: string;
      chunkIndex: number;
      content: string;
      score: number;
    }>;
    // For products, attributes might be included
    attributes?: {
      price?: string;
      category?: string;
      brand?: string;
      rating?: number;
      availability?: string;
    };
    highlights?: string[]; // Azure search highlights
  }>;
  data?: {
    results?: Array<any>; // Some API responses nest results under data
    facets?: any; // Facets from API response
  };
  // Azure search response structure
  facets?: {
    brands?: Array<{ value: string; count: number }>;
    categories?: Array<{ value: string; count: number }>;
    availability?: Array<{ value: string; count: number }>;
    price_ranges?: Array<{ range: string; count: number }>;
    ratings?: Array<{ value: number; count: number }>;
  };
  total?: number;
  suggestions?: string[];
}

/**
 * Gets the WordPress REST API URL for secure search proxy
 */
const getWordPressRestUrl = (): string => {
  const win = window as WindowWithWordPressSettings;
  const wpRestUrl = win.LumenSearchSettings?.wp_rest_url;
  if (wpRestUrl) {
    console.log('WordPress REST URL: ', wpRestUrl);
    return wpRestUrl;
  }
  // Fallback: try to detect WordPress REST URL from current page
  const currentUrl = window.location.origin;
  const fallbackUrl = `${currentUrl}/wp-json/lumen-search/v1`;
  console.log('Using fallback WordPress REST URL: ', fallbackUrl);
  return fallbackUrl;
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

/**
 * Calculates a lighter/more visible color for the scroll bar based on the text color
 */
const calculateScrollbarColor = (textColor: string): string => {
  // Default fallback
  const defaultColor = '#888';

  if (!textColor) return defaultColor;

  // Handle hex colors
  if (textColor.startsWith('#')) {
    const hex = textColor.replace('#', '');
    const r = parseInt(hex.substr(0, 2), 16);
    const g = parseInt(hex.substr(2, 2), 16);
    const b = parseInt(hex.substr(4, 2), 16);

    // Calculate luminance
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;

    // If text is dark, use a lighter version for scroll bar
    // If text is light, use a darker version for scroll bar
    if (luminance < 0.5) {
      // Dark text - lighten it for scroll bar (blend with white)
      const newR = Math.min(255, r + (255 - r) * 0.5);
      const newG = Math.min(255, g + (255 - g) * 0.5);
      const newB = Math.min(255, b + (255 - b) * 0.5);
      return `rgb(${Math.round(newR)}, ${Math.round(newG)}, ${Math.round(newB)})`;
    } else {
      // Light text - darken it for scroll bar (blend with black)
      const newR = r * 0.6;
      const newG = g * 0.6;
      const newB = b * 0.6;
      return `rgb(${Math.round(newR)}, ${Math.round(newG)}, ${Math.round(newB)})`;
    }
  }

  // Handle rgb/rgba colors
  const rgbMatch = textColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (rgbMatch) {
    const r = parseInt(rgbMatch[1]);
    const g = parseInt(rgbMatch[2]);
    const b = parseInt(rgbMatch[3]);

    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;

    if (luminance < 0.5) {
      const newR = Math.min(255, r + (255 - r) * 0.5);
      const newG = Math.min(255, g + (255 - g) * 0.5);
      const newB = Math.min(255, b + (255 - b) * 0.5);
      return `rgb(${Math.round(newR)}, ${Math.round(newG)}, ${Math.round(newB)})`;
    } else {
      const newR = r * 0.6;
      const newG = g * 0.6;
      const newB = b * 0.6;
      return `rgb(${Math.round(newR)}, ${Math.round(newG)}, ${Math.round(newB)})`;
    }
  }

  return defaultColor;
};

@Component({
  tag: 'lumen-search',
  styleUrl: 'lumen-search.css',
  shadow: true, // Use shadow DOM to isolate the component
})
export class LumenSearch {
  @Prop() siteId: string;
  @Prop() apiKey: string;
  @Prop() apiEndpoint: string;
  @Prop() topK: number = 10;
  @Prop() displayMode: 'icon' | 'embedded' = 'icon'; // Add display mode prop
  @Prop() contentType: 'posts' | 'products' | 'all' = 'all'; // Content type prop
  @Prop() enableFacets: boolean = false; // Faceted search toggle
  @Prop() enableSuggestions: boolean = false; // Search suggestions disabled
  @State() query: string = '';
  @State() results: SearchResult[] = [];
  @State() isOpen: boolean = false;
  @State() isLoading: boolean = false;
  @State() hasSearched: boolean = false;
  @State() showPlaceholders: boolean = true;
  @State() placeholderItems: any[] = [];
  @State() uiStyles: any = {};
  @State() placeholdersEnabled: boolean = true;
  @State() availableFacets: any = {};
  @State() activeFacets: any = {};
  @State() suggestions: string[] = [];
  @State() showSuggestions: boolean = false;

  /**
   * We'll store a numeric ID for the debounce timer so we can clear it.
   */
  private debounceTimer?: number;
  private inputRef?: HTMLInputElement;
  private modalRef?: HTMLDivElement;

  private loadSettingsFromWindow() {
    const win = window as WindowWithWordPressSettings;

    if (win.LumenSearchSettings) {
      if (win.LumenSearchSettings.placeholders !== undefined) {
        this.placeholderItems = win.LumenSearchSettings.placeholders;
      }
      if (win.LumenSearchSettings.ui_styles) {
        this.uiStyles = win.LumenSearchSettings.ui_styles;
      }
      if (typeof win.LumenSearchSettings.enable_placeholders === 'boolean') {
        this.placeholdersEnabled = win.LumenSearchSettings.enable_placeholders;
      }
      
      // Load Azure AI Search settings
      if (win.LumenSearchSettings.content_type) {
        this.contentType = win.LumenSearchSettings.content_type;
      }
      if (typeof win.LumenSearchSettings.enable_faceted_search === 'boolean') {
        this.enableFacets = win.LumenSearchSettings.enable_faceted_search;
      }
      // Also check for the WooCommerce version that uses enable_faceted_search
      if (win.LumenSearchSettings.content_type === 'products' && typeof win.LumenSearchSettings.enable_faceted_search === 'boolean') {
        this.enableFacets = win.LumenSearchSettings.enable_faceted_search;
      }
      if (win.LumenSearchSettings.available_facets) {
        this.availableFacets = win.LumenSearchSettings.available_facets;
      }
    }
  }

  async componentWillLoad() {
    // Try to load settings from WordPress if available
    this.loadSettingsFromWindow();

    const win = window as WindowWithWordPressSettings;

    // If we have a WordPress REST URL, try to fetch fresh settings
    if (win.LumenSearchSettings?.wp_rest_url) {
      try {
        const response = await fetch(`${win.LumenSearchSettings.wp_rest_url}/settings`);
        if (response.ok) {
          const settings = await response.json();
          this.placeholdersEnabled = settings.enable_placeholders ?? true;
          this.placeholderItems = settings.placeholders ?? [];
          this.uiStyles = settings.ui_styles ?? {};
        }
      } catch (error) {
        console.log('Could not fetch WordPress settings, using defaults');
      }
    }

    // Only use default placeholders if placeholders are enabled and none are explicitly set
    if (this.placeholdersEnabled && (!this.placeholderItems || this.placeholderItems.length === 0)) {
      this.placeholderItems = [
        {
          title: 'Query the Culture Hack curriculum',
          subtitle: 'What is a listening model?',
        },
        {
          title: 'Query in any language',
          subtitle: '¿Qué es un modelo de escucha?',
        },
        {
          title: 'Find results with vector search',
          subtitle: 'How to orient towards justice?',
        },
      ];
    }
  }

  componentDidLoad() {
    // Re-check settings when component loads (for admin preview updates)
    this.loadSettingsFromWindow();
  }

  componentWillRender() {
    // Re-check settings before each render (for admin preview updates)
    this.loadSettingsFromWindow();

    console.log('LumenSearch rendering with:', {
      placeholdersEnabled: this.placeholdersEnabled,
      placeholderItems: this.placeholderItems,
      query: this.query,
      hasSearched: this.hasSearched,
    });
  }

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

    // Hide placeholders when user starts typing
    if (inputEl.value.trim().length > 0) {
      this.showPlaceholders = false;
    }

    // Get suggestions if enabled
    if (this.enableSuggestions && inputEl.value.trim().length >= 2) {
      this.getSuggestions(inputEl.value.trim());
    } else {
      this.showSuggestions = false;
    }

    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    this.debounceTimer = window.setTimeout(this.performSearch, 500);
  };

  /**
   * Convert embedding search response to SearchResult format
   * Handles both knowledge posts and product results
   */
  private convertEmbeddingResponseToSearchResults = (embeddingResponse: EmbeddingSearchResponse): SearchResult[] => {
    // Check for results in different possible locations
    const results = embeddingResponse.results || embeddingResponse.data?.results || [];

    if (embeddingResponse.success === false && !embeddingResponse.data) {
      return [];
    }

    if (results.length === 0) {
      return [];
    }

    // Detect if these are product results or knowledge posts
    const firstResult = results[0];
    const isProductSearch = firstResult.type === 'product' || firstResult.price !== undefined || firstResult.rating !== undefined || firstResult.attributes !== undefined;

    // Convert each result based on its type
    return results.map(result => {
      if (isProductSearch) {
        // Handle product results
        return {
          id: String(result.id || result.postId || ''),
          title: result.title || result.postTitle || '',
          content: result.content || result.description || '',
          url: result.url || result.postUrl || '',
          type: 'product' as const,
          metadata: {
            matchingBlocks: [
              {
                blockId: String(result.id || ''),
                content: result.content || result.description || '',
                score: result.similarity || result.score || 0,
                url: result.url || '',
              },
            ],
          },
          productData: {
            price: result.price || result.attributes?.price || '',
            image: result.image || '',
            rating: result.rating || result.attributes?.rating || 0,
            inStock: result.in_stock !== undefined ? result.in_stock : result.attributes?.availability === 'in_stock',
            category: result.category || result.attributes?.category || '',
            brand: result.brand || result.attributes?.brand || '',
          },
        };
      } else {
        // Handle knowledge post results (backward compatibility)
        return {
          id: result.postId || result.id || '',
          title: result.postTitle || result.title || '',
          content: '', // Content will be filled from chunks
          url: result.postUrl || result.url || '',
          type: 'post' as const,
          metadata: {
            matchingBlocks: result.chunks
              ? result.chunks.map(chunk => ({
                  blockId: chunk.chunkId,
                  content: chunk.content,
                  score: chunk.score,
                  url: result.postUrl || result.url || '',
                }))
              : [
                  {
                    blockId: result.id || result.postId || '',
                    content: result.content || '',
                    score: result.similarity || result.score || 0,
                    url: result.postUrl || result.url || '',
                  },
                ],
          },
        };
      }
    });
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
      this.showPlaceholders = true;
      return;
    }

    try {
      this.isLoading = true;
      this.showPlaceholders = false;
      
      // Use secure WordPress REST API endpoint
      const wpRestUrl = getWordPressRestUrl();
      const searchEndpoint = `${wpRestUrl}/search`;
      
      const win = window as WindowWithWordPressSettings;
      
      // Simple search payload
      const searchPayload = {
        query: this.query,
        limit: this.topK || win.LumenSearchSettings?.topK || 10,
        content_type: this.contentType || 'posts'
      };

      console.log('Performing secure search on endpoint: ', searchEndpoint);
      console.log('Search payload: ', searchPayload);
      
      // Use WordPress REST API (no API key needed - handled server-side)
      const searchHeaders = {
        'Content-Type': 'application/json',
      };
      
      const searchRes = await fetch(searchEndpoint, {
        method: 'POST',
        headers: searchHeaders,
        body: JSON.stringify(searchPayload),
      });

      if (!searchRes.ok) {
        throw new Error(`HTTP error! status: ${searchRes.status}`);
      }

      // Parse the search response
      const embeddingData = (await searchRes.json()) as EmbeddingSearchResponse;

      // Add debug logging
      console.log('Raw API response:', embeddingData);
      console.log('Has success?', embeddingData.success);
      console.log('Results length:', embeddingData.results?.length);

      if ((embeddingData.success === false) || !embeddingData.results || embeddingData.results.length === 0) {
        console.log('No results found in response');
        this.results = [];
        this.hasSearched = true;
        return;
      }

      // Convert embedding response directly to SearchResult format
      this.results = this.convertEmbeddingResponseToSearchResults(embeddingData);
      console.log('Converted results:', this.results);

      // Update available facets if this is a faceted search
      if (embeddingData.facets && this.enableFacets) {
        this.availableFacets = embeddingData.facets;
        console.log('Updated facets:', this.availableFacets);
      }

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
    this.showPlaceholders = true;

    if (this.isOpen) {
      // Focus the input field when modal opens
      setTimeout(() => {
        if (this.inputRef) {
          this.inputRef.focus();
        }
      }, 100);

      // Add class to prevent scrolling on body
      document.body.classList.add('lumen-search-modal-open');
    } else {
      // Remove class when modal closes
      document.body.classList.remove('lumen-search-modal-open');
    }
  };

  private handlePlaceholderSelected = (subtitle: string): void => {
    if (this.inputRef) {
      this.query = subtitle;
      this.inputRef.value = subtitle;
      this.showPlaceholders = false;
      this.performSearch();
    }
  };


  /**
   * Handle facet filter changes
   */
  private handleFacetChange = (facetType: string, value: string, checked: boolean): void => {
    if (!this.activeFacets[facetType]) {
      this.activeFacets[facetType] = [];
    }
    
    if (checked) {
      if (!this.activeFacets[facetType].includes(value)) {
        this.activeFacets[facetType].push(value);
      }
    } else {
      const index = this.activeFacets[facetType].indexOf(value);
      if (index > -1) {
        this.activeFacets[facetType].splice(index, 1);
      }
    }
    
    // Re-trigger search with new filters
    if (this.query.trim().length > 0) {
      this.performSearch();
    }
  };

  /**
   * Clear all facet filters
   */
  private clearFacets = (): void => {
    this.activeFacets = {};
    if (this.query.trim().length > 0) {
      this.performSearch();
    }
  };

  /**
   * Get search suggestions as user types
   * Disabled - suggestions functionality has been removed
   */
  private getSuggestions = async (_query: string): Promise<void> => {
    // Suggestions functionality has been disabled
    this.suggestions = [];
    this.showSuggestions = false;
    return;
  };

  /**
   * Handle suggestion selection
   */
  private selectSuggestion = (suggestion: string): void => {
    this.query = suggestion;
    if (this.inputRef) {
      this.inputRef.value = suggestion;
    }
    this.showSuggestions = false;
    this.performSearch();
  };

  private closeModal = (): void => {
    this.isOpen = false;
    this.query = '';
    this.results = [];
    this.hasSearched = false;
    this.showPlaceholders = true;
    document.body.classList.remove('lumen-search-modal-open');
  };

  // Handle clicking outside to close the modal
  private handleBackdropClick = (event: MouseEvent): void => {
    if (this.modalRef && !this.modalRef.contains(event.target as Node)) {
      this.closeModal();
    }
  };

  disconnectedCallback() {
    // Ensure we remove the class if component is unmounted while modal is open
    document.body.classList.remove('lumen-search-modal-open');
  }


  /**
   * Render search suggestions dropdown
   */
  private renderSuggestions() {
    if (!this.showSuggestions || this.suggestions.length === 0) {
      return null;
    }

    return (
      <div class="search-suggestions">
        {this.suggestions.map(suggestion => (
          <div 
            class="suggestion-item"
            onClick={() => this.selectSuggestion(suggestion)}
          >
            {suggestion}
          </div>
        ))}
      </div>
    );
  }

  /**
   * Render faceted search filters
   */
  private renderFacetFilters() {
    if (!this.enableFacets || this.contentType !== 'products') {
      return null;
    }
    
    // Show facets even if no availableFacets yet, for better UX
    if (!this.availableFacets || Object.keys(this.availableFacets).length === 0) {
      return (
        <div class="facet-filters">
          <div class="facet-header">
            <h4>Filter Results</h4>
          </div>
          <div class="facet-loading">
            <p>Filters will appear after searching...</p>
          </div>
        </div>
      );
    }

    const hasActiveFacets = Object.keys(this.activeFacets).some(key => 
      this.activeFacets[key] && this.activeFacets[key].length > 0
    );

    return (
      <div class="facet-filters">
        <div class="facet-header">
          <h4>Filter Results</h4>
          {hasActiveFacets && (
            <button class="clear-filters" onClick={this.clearFacets}>
              Clear All
            </button>
          )}
        </div>

        {/* Brand filter */}
        {this.availableFacets.brands && this.availableFacets.brands.length > 0 && (
          <div class="facet-group">
            <h5>Brand</h5>
            {this.availableFacets.brands.slice(0, 5).map(brand => (
              <label class="facet-option">
                <input
                  type="checkbox"
                  checked={this.activeFacets.brand && this.activeFacets.brand.includes(brand.value)}
                  onChange={(e) => this.handleFacetChange('brand', brand.value, (e.target as HTMLInputElement).checked)}
                />
                {brand.value} ({brand.count})
              </label>
            ))}
          </div>
        )}

        {/* Category filter */}
        {this.availableFacets.categories && this.availableFacets.categories.length > 0 && (
          <div class="facet-group">
            <h5>Category</h5>
            {this.availableFacets.categories.slice(0, 5).map(category => (
              <label class="facet-option">
                <input
                  type="checkbox"
                  checked={this.activeFacets.category && this.activeFacets.category.includes(category.value)}
                  onChange={(e) => this.handleFacetChange('category', category.value, (e.target as HTMLInputElement).checked)}
                />
                {category.value} ({category.count})
              </label>
            ))}
          </div>
        )}

        {/* Availability filter */}
        {this.availableFacets.availability && this.availableFacets.availability.length > 0 && (
          <div class="facet-group">
            <h5>Availability</h5>
            {this.availableFacets.availability.map(availability => (
              <label class="facet-option">
                <input
                  type="checkbox"
                  checked={this.activeFacets.availability && this.activeFacets.availability.includes(availability.value)}
                  onChange={(e) => this.handleFacetChange('availability', availability.value, (e.target as HTMLInputElement).checked)}
                />
                {availability.value} ({availability.count})
              </label>
            ))}
          </div>
        )}

        {/* Rating filter */}
        {this.availableFacets.ratings && this.availableFacets.ratings.length > 0 && (
          <div class="facet-group">
            <h5>Rating</h5>
            {this.availableFacets.ratings.map(rating => (
              <label class="facet-option">
                <input
                  type="checkbox"
                  checked={this.activeFacets.rating && this.activeFacets.rating.includes(rating.value.toString())}
                  onChange={(e) => this.handleFacetChange('rating', rating.value.toString(), (e.target as HTMLInputElement).checked)}
                />
                {rating.value}+ Stars ({rating.count})
              </label>
            ))}
          </div>
        )}
      </div>
    );
  }

  render() {
    // Count total results across all matching blocks
    const totalResultCount = this.results.reduce((count, result) => count + result.metadata.matchingBlocks.length, 0);
    console.log('Total result count: ', this.results);

    // Apply custom styles from WordPress settings
    const textColor = this.uiStyles.text_color || '#333333';
    const containerStyle = {
      'fontFamily': this.uiStyles.font_family || 'inherit',
      'fontSize': this.uiStyles.font_size || '16px',
      'color': textColor,
      '--primary-color': this.uiStyles.primary_color || '#0073aa',
      '--background-color': this.uiStyles.background_color || '#ffffff',
      '--border-color': this.uiStyles.border_color || '#dddddd',
      '--border-radius': this.uiStyles.border_radius || '4px',
      '--border-width': this.uiStyles.border_width || '1px',
      '--button-bg': this.uiStyles.button_bg || '#0073aa',
      '--button-text-color': this.uiStyles.button_text_color || '#ffffff',
      '--button-hover-bg': this.uiStyles.button_hover_bg || '#005a87',
      '--max-width': this.uiStyles.max_width || '800px',
      '--input-height': this.uiStyles.input_height || '45px',
      '--results-max-height': this.uiStyles.results_max_height || '400px',
      '--scrollbar-color': calculateScrollbarColor(textColor),
    };

    // For embedded mode (e.g., admin preview), render the search directly
    if (this.displayMode === 'embedded') {
      return (
        <div class="lumen-search-embedded" style={containerStyle}>
          <div class="search-controls-wrapper">
            <div class="search-input-wrapper embedded">
              <svg
                class="search-icon"
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                width="18"
                height="18"
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
                class="search-input"
                placeholder={this.contentType === 'products' ? 'Search products...' : 'Search...'}
                value={this.query}
                onInput={this.handleInput}
                onFocus={() => {
                  // Only open if we have content to show
                  if (this.hasSearched || (this.placeholdersEnabled && this.placeholderItems && this.placeholderItems.length > 0)) {
                    this.isOpen = true;
                  }
                }}
                aria-label="Search"
                style={{
                  fontFamily: this.uiStyles.font_family || 'inherit',
                  fontSize: this.uiStyles.font_size || '16px',
                  color: this.uiStyles.text_color || '#333333',
                  backgroundColor: this.uiStyles.background_color || '#ffffff',
                  height: this.uiStyles.input_height || '45px',
                  border: `${this.uiStyles.border_width || '1px'} solid ${this.uiStyles.border_color || '#dddddd'}`,
                  borderRadius: this.uiStyles.border_radius || '4px',
                }}
              />
              <button
                class="search-button"
                onClick={() => this.performSearch()}
                style={{
                  backgroundColor: this.uiStyles.button_bg || '#0073aa',
                  color: this.uiStyles.button_text_color || '#ffffff',
                  borderRadius: this.uiStyles.border_radius || '4px',
                }}
              >
                Search
              </button>
            </div>
            
            {/* Search controls row */}
            <div class="search-controls-row">
            </div>
          </div>

          {/* Search suggestions */}
          {this.renderSuggestions()}

          {/* Results or placeholders below the search bar - only show if there's content */}
          {this.isOpen && (this.isLoading || this.hasSearched || (this.placeholdersEnabled && this.placeholderItems && this.placeholderItems.length > 0)) && (
            <div
              class="search-results-dropdown"
              style={{
                maxHeight: this.uiStyles.results_max_height || '400px',
                backgroundColor: this.uiStyles.background_color || '#ffffff',
                border: `${this.uiStyles.border_width || '1px'} solid ${this.uiStyles.border_color || '#dddddd'}`,
                borderRadius: this.uiStyles.border_radius || '4px',
                marginTop: '10px',
              }}
            >
              {this.isLoading ? (
                <div class="search-status">Searching...</div>
              ) : (
                <div class="search-results-container">
                  {!this.hasSearched && !this.query && this.placeholdersEnabled && this.placeholderItems && this.placeholderItems.length > 0 && (
                    <search-placeholders
                      isVisible={true}
                      selectPlaceholder={this.handlePlaceholderSelected}
                      placeholders={this.placeholderItems}
                      customStyles={this.uiStyles}
                    ></search-placeholders>
                  )}

                  {this.hasSearched && (
                    <div>
                      {this.results.length > 0 ? (
                        <div class={`search-results-${this.enableFacets && this.contentType === 'products' ? 'with-facets' : 'no-facets'}`}>
                          {/* Facet filters sidebar - only for products */}
                          {this.enableFacets && this.contentType === 'products' && this.renderFacetFilters()}
                          
                          {/* Main results */}
                          <div class="search-results-main">
                            <div class="search-results-count">
                              {totalResultCount} result{totalResultCount !== 1 ? 's' : ''} found
                            </div>
                            <div class="search-results-list">
                              {this.results.map(result => (
                                <div class="result-group">
                                  {result.metadata.matchingBlocks.map(block => (
                                    <search-result
                                      resultId={block.blockId}
                                      resultTitle={result.title}
                                      resultSnippet={cleanTextContent(block.content)}
                                      resultUrl={result.url}
                                      resultType={result.type || 'post'}
                                      similarityScore={block.score}
                                      // Product-specific props (will be undefined for posts)
                                      productPrice={result.productData?.price}
                                      productImage={result.productData?.image}
                                      productRating={result.productData?.rating}
                                      productInStock={result.productData?.inStock}
                                      productCategory={result.productData?.category}
                                      productBrand={result.productData?.brand}
                                    ></search-result>
                                  ))}
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div class="search-results-empty">No results found. Try a different search term.</div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      );
    }

    // Default icon mode
    return (
      <div class="lumen-search-container" style={containerStyle}>
        {/* Search icon in the top right */}
        <div class="search-icon-container" onClick={this.toggleSearchModal}>
          <span class="search-text">Search</span>

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
            <div
              class="search-modal-content"
              ref={el => (this.modalRef = el as HTMLDivElement)}
              style={{
                maxWidth: this.uiStyles.max_width || '800px',
                backgroundColor: this.uiStyles.background_color || '#ffffff',
                borderRadius: this.uiStyles.border_radius || '4px',
                border: `${this.uiStyles.border_width || '1px'} solid ${this.uiStyles.border_color || '#dddddd'}`,
              }}
            >
              <div class="search-modal-header">
                <div class="search-input-wrapper">
                  <svg
                    class="search-icon"
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    width="18"
                    height="18"
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
                    ref={el => (this.inputRef = el as HTMLInputElement)}
                    type="text"
                    class="search-modal-input"
                    placeholder={this.contentType === 'products' ? 'Search products...' : 'Search...'}
                    value={this.query}
                    onInput={this.handleInput}
                    aria-label="Search"
                    id="search-modal-title"
                    style={{
                      fontFamily: this.uiStyles.font_family || 'inherit',
                      fontSize: this.uiStyles.font_size || '16px',
                      color: this.uiStyles.text_color || '#333333',
                      height: this.uiStyles.input_height || '45px',
                    }}
                  />
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
                
                {/* Search controls for modal */}
                <div class="search-controls-row modal">
                    </div>
                
                {/* Search suggestions for modal */}
                {this.renderSuggestions()}
              </div>

              <div class="search-modal-body" style={{ maxHeight: this.uiStyles.results_max_height || '400px' }}>
                {this.isLoading ? (
                  <div class="search-status">Searching...</div>
                ) : (
                  <div class="search-results-container">
                    {/* Show placeholders when no search has been performed and they are enabled with content */}
                    {!this.hasSearched && !this.query && this.placeholdersEnabled && this.placeholderItems && this.placeholderItems.length > 0 && (
                      <search-placeholders
                        isVisible={true}
                        selectPlaceholder={this.handlePlaceholderSelected}
                        placeholders={this.placeholderItems}
                        customStyles={this.uiStyles}
                      ></search-placeholders>
                    )}

                    {/* Show results when a search has been performed */}
                    {this.hasSearched && (
                      <div>
                        {this.results.length > 0 ? (
                          <div class={`search-results-${this.enableFacets && this.contentType === 'products' ? 'with-facets' : 'no-facets'} modal`}>
                            {/* Facet filters sidebar for modal - only for products */}
                            {this.enableFacets && this.contentType === 'products' && this.renderFacetFilters()}
                            
                            {/* Main results for modal */}
                            <div class="search-results-main">
                              <div class="search-results-count">
                                {totalResultCount} result{totalResultCount !== 1 ? 's' : ''} found
                              </div>
                              <div class="search-results-list">
                                {/* Render each search result and its matching blocks */}
                                {this.results.map(result => (
                                  <div class="result-group">
                                    {result.metadata.matchingBlocks.map(block => (
                                      <search-result
                                        resultId={block.blockId}
                                        resultTitle={result.title}
                                        resultSnippet={cleanTextContent(block.content)}
                                        resultUrl={result.url}
                                        resultType={result.type || 'post'}
                                        similarityScore={block.score}
                                        // Product-specific props (will be undefined for posts)
                                        productPrice={result.productData?.price}
                                        productImage={result.productData?.image}
                                        productRating={result.productData?.rating}
                                        productInStock={result.productData?.inStock}
                                        productCategory={result.productData?.category}
                                        productBrand={result.productData?.brand}
                                      ></search-result>
                                    ))}
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div class="search-results-empty">No results found. Try a different search term.</div>
                        )}
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
