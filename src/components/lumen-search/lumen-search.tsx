import { Component, h, State, Listen, Prop } from '@stencil/core';

// Currency settings interface
interface CurrencySettings {
  code: string;
  symbol: string;
  position: 'left' | 'right' | 'left_space' | 'right_space';
  thousand_sep: string;
  decimal_sep: string;
  decimals: number;
}

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
    // Currency settings
    currency?: CurrencySettings;
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
    postId?: string | number; // Optional for backward compatibility
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
    // For knowledge posts with chunks (new format from lighthouse-api)
    matchingChunks?: Array<{
      chunkId: string;
      chunkIndex: number;
      content: string;
      score: number;
    }>;
    // Legacy chunks format for backward compatibility
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
 * Format a price according to currency settings
 */
const formatPrice = (amount: number | string, currency?: CurrencySettings): string => {
  // Parse amount to number
  const numAmount = typeof amount === 'string' ? parseFloat(amount) : amount;

  if (isNaN(numAmount)) return '';

  // Default currency settings (USD)
  const settings = currency || {
    code: 'USD',
    symbol: '$',
    position: 'left',
    thousand_sep: ',',
    decimal_sep: '.',
    decimals: 2,
  };

  // Format number with separators
  const parts = numAmount.toFixed(settings.decimals).split('.');
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, settings.thousand_sep);
  const formattedNumber = parts.join(settings.decimal_sep);

  // Apply currency symbol based on position
  switch (settings.position) {
    case 'left':
      return `${settings.symbol}${formattedNumber}`;
    case 'right':
      return `${formattedNumber}${settings.symbol}`;
    case 'left_space':
      return `${settings.symbol} ${formattedNumber}`;
    case 'right_space':
      return `${formattedNumber} ${settings.symbol}`;
    default:
      return `${settings.symbol}${formattedNumber}`;
  }
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
  @State() currency: CurrencySettings | null = null;

  // Store unfiltered results for client-side filtering
  private unfilteredResults: SearchResult[] = [];

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
      // Load currency settings
      if (win.LumenSearchSettings.currency) {
        this.currency = win.LumenSearchSettings.currency;
      }
      // DON'T overwrite availableFacets from window settings
      // They come from search API responses, not from initial page load settings
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
        // Handle knowledge post results (with improved chunk handling)
        const chunks = result.matchingChunks || result.chunks || [];
        
        return {
          id: String(result.postId || result.id || ''),
          title: result.postTitle || result.title || '',
          content: chunks.length > 0 ? chunks[0].content : (result.content || ''), // Use first chunk content or fallback
          url: result.postUrl || result.url || '',
          type: 'post' as const,
          metadata: {
            matchingBlocks: chunks.length > 0
              ? chunks.map(chunk => ({
                  blockId: chunk.chunkId || String(chunk.chunkIndex || 0),
                  content: chunk.content,
                  score: chunk.score,
                  url: result.postUrl || result.url || '',
                }))
              : [
                  {
                    blockId: String(result.id || result.postId || ''),
                    content: result.content || '',
                    score: result.maxScore || result.similarity || result.score || 0,
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
      
      // Build search payload with facet filters
      const searchPayload: any = {
        query: this.query,
        limit: this.topK || win.LumenSearchSettings?.topK || 10,
        content_type: this.contentType || 'posts'
      };
      
      // Add active facet filters to the payload if any are selected
      if (Object.keys(this.activeFacets).length > 0) {
        searchPayload.filters = this.activeFacets;
      }
      
      // Include facets request for product searches
      if (this.contentType === 'products' && this.enableFacets) {
        searchPayload.includeFacets = true;
      }

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
      const convertedResults = this.convertEmbeddingResponseToSearchResults(embeddingData);

      // Store unfiltered results for client-side filtering
      this.unfilteredResults = convertedResults;
      this.results = convertedResults;

      console.log('Converted results:', this.results);

      // Generate facets client-side from results
      if (this.enableFacets) {
        console.log('Generating facets client-side from', convertedResults.length, 'results');
        this.generateFacetsFromResults();
      } else {
        this.availableFacets = {};
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


  // Removed normalizeFacetData - WordPress REST API now handles facet normalization
  // Facets are guaranteed to arrive in the correct format (plural keys)

  /**
   * Format price range text with proper currency
   * Converts "$25 - $50" to "R25 - R50" (or whatever currency is set)
   */
  private formatPriceRange = (rangeText: string): string => {
    if (!this.currency) return rangeText; // No currency settings, return as-is

    // Match closed range: "$25 - $50"
    const closedMatch = rangeText.match(/\$(\d+(?:,\d{3})*(?:\.\d+)?)\s*-\s*\$(\d+(?:,\d{3})*(?:\.\d+)?)/);
    if (closedMatch) {
      const min = parseFloat(closedMatch[1].replace(/,/g, ''));
      const max = parseFloat(closedMatch[2].replace(/,/g, ''));
      return `${formatPrice(min, this.currency)} - ${formatPrice(max, this.currency)}`;
    }

    // Match open-ended range: "$1000+"
    const openMatch = rangeText.match(/\$(\d+(?:,\d{3})*(?:\.\d+)?)\+/);
    if (openMatch) {
      const min = parseFloat(openMatch[1].replace(/,/g, ''));
      return `${formatPrice(min, this.currency)}+`;
    }

    // If no match, return original
    return rangeText;
  };

  /**
   * Parse and format product price from API response
   * Handles prices that may come with HTML tags or currency symbols
   */
  private parseAndFormatPrice = (priceString: string): string => {
    if (!priceString || !this.currency) {
      return priceString || '';
    }

    // Strip HTML tags and any non-numeric characters except decimal point and comma
    const cleanPrice = priceString.replace(/<[^>]*>/g, '').replace(/[^\d.,]/g, '');

    // Parse the price (handle both comma and period as decimal separator)
    const price = parseFloat(cleanPrice.replace(/,/g, ''));

    if (isNaN(price)) {
      return priceString; // Return original if parsing fails
    }

    return formatPrice(price, this.currency);
  };

  /**
   * Generate facets client-side from search results
   * Analyzes results to create facet buckets with counts
   * @param results - The results to generate facets from (defaults to current filtered results)
   */
  private generateFacetsFromResults = (results?: SearchResult[]): void => {
    // Use provided results, or fall back to current filtered results
    const sourceResults = results || this.results || this.unfilteredResults || [];

    if (!sourceResults || sourceResults.length === 0) {
      this.availableFacets = {};
      return;
    }

    console.log('Generating facets from', sourceResults.length, 'results');

    const facets: any = {};

    // Get enabled facets from window settings
    const win = window as any;
    const enabledFacets = win.LumenSearchSettings?.enabled_facets || {};

    console.log('Enabled facets:', enabledFacets);

    // Process each result to build facet counts
    sourceResults.forEach(result => {
      const attrs = result.productData;
      if (!attrs) return;

      // Process each enabled facet
      Object.keys(enabledFacets).forEach(facetSlug => {
        const facetInfo = enabledFacets[facetSlug];

        // Skip if no label (invalid facet)
        if (!facetInfo || !facetInfo.label) return;

        // Handle different facet types
        if (facetSlug === 'price_range') {
          // Price ranges - create buckets (use singular key to match filtering)
          if (!facets.price_range) {
            facets.price_range = [];
          }

          const price = parseFloat(attrs.price || '0');
          if (price > 0) {
            // Determine which price bucket this product falls into
            if (price < 25) {
              this.incrementFacetCount(facets.price_range, '$0 - $25', true);
            } else if (price < 50) {
              this.incrementFacetCount(facets.price_range, '$25 - $50', true);
            } else if (price < 100) {
              this.incrementFacetCount(facets.price_range, '$50 - $100', true);
            } else if (price < 250) {
              this.incrementFacetCount(facets.price_range, '$100 - $250', true);
            } else if (price < 500) {
              this.incrementFacetCount(facets.price_range, '$250 - $500', true);
            } else if (price < 1000) {
              this.incrementFacetCount(facets.price_range, '$500 - $1,000', true);
            } else {
              this.incrementFacetCount(facets.price_range, '$1,000+', true);
            }
          }
        } else if (facetSlug === 'stock_status') {
          // Stock status (use singular key to match filtering)
          if (!facets.availability) {
            facets.availability = [];
          }

          const stockStatus = attrs.inStock ? 'in_stock' : 'out_of_stock';
          this.incrementFacetCount(facets.availability, stockStatus);
        } else if (facetSlug === 'rating') {
          // Ratings - create buckets for 4+, 3+, 2+, 1+ (use singular key to match filtering)
          if (!facets.rating) {
            facets.rating = [];
          }

          const rating = parseFloat(String(attrs.rating || 0));
          if (rating >= 4) {
            this.incrementFacetCount(facets.rating, '4');
          }
          if (rating >= 3) {
            this.incrementFacetCount(facets.rating, '3');
          }
          if (rating >= 2) {
            this.incrementFacetCount(facets.rating, '2');
          }
          if (rating >= 1) {
            this.incrementFacetCount(facets.rating, '1');
          }
        } else if (facetSlug === 'product_cat') {
          // Categories (use singular key to match filtering)
          if (!facets.category) {
            facets.category = [];
          }

          const category = attrs.category;
          if (category) {
            if (Array.isArray(category)) {
              category.forEach(cat => this.incrementFacetCount(facets.category, cat));
            } else {
              this.incrementFacetCount(facets.category, category);
            }
          }
        } else if (facetSlug === 'product_brand') {
          // Brands (use singular key to match filtering)
          if (!facets.brand) {
            facets.brand = [];
          }

          const brand = attrs.brand;
          if (brand) {
            if (Array.isArray(brand)) {
              brand.forEach(b => this.incrementFacetCount(facets.brand, b));
            } else {
              this.incrementFacetCount(facets.brand, brand);
            }
          }
        } else {
          // Custom attributes (pa_color, pa_size, etc.)
          // Map to a generic facet collection
          const attributeKey = facetSlug.replace('pa_', ''); // Strip pa_ prefix for display

          if (!facets[attributeKey]) {
            facets[attributeKey] = [];
          }

          // Try to get attribute value from product data
          const attrValue = attrs[facetSlug] || attrs[attributeKey];
          if (attrValue) {
            if (Array.isArray(attrValue)) {
              attrValue.forEach(val => this.incrementFacetCount(facets[attributeKey], val));
            } else {
              this.incrementFacetCount(facets[attributeKey], attrValue);
            }
          }
        }
      });
    });

    // Sort facets by count (descending)
    Object.keys(facets).forEach(key => {
      facets[key].sort((a: any, b: any) => b.count - a.count);
    });

    console.log('Generated facets:', facets);

    this.availableFacets = facets;
  };

  /**
   * Helper to increment count for a facet value
   */
  private incrementFacetCount = (facetArray: any[], value: string, isRange: boolean = false): void => {
    const existing = facetArray.find((item: any) => item.value === value || item.range === value);

    if (existing) {
      existing.count++;
    } else {
      // Use explicit isRange flag instead of string detection
      if (isRange) {
        facetArray.push({ range: value, count: 1 });
      } else {
        facetArray.push({ value: value, count: 1 });
      }
    }
  };

  /**
   * Handle facet filter changes - CLIENT-SIDE filtering for instant results
   */
  private handleFacetChange = (facetType: string, value: string, checked: boolean): void => {
    // Create a new copy of activeFacets to trigger re-render
    const newActiveFacets = { ...this.activeFacets };

    if (!newActiveFacets[facetType]) {
      newActiveFacets[facetType] = [];
    }

    if (checked) {
      if (!newActiveFacets[facetType].includes(value)) {
        newActiveFacets[facetType] = [...newActiveFacets[facetType], value];
      }
    } else {
      newActiveFacets[facetType] = newActiveFacets[facetType].filter(v => v !== value);
    }

    // Remove empty arrays
    if (newActiveFacets[facetType].length === 0) {
      delete newActiveFacets[facetType];
    }

    this.activeFacets = newActiveFacets;
    console.log('Updated active facets:', this.activeFacets);

    // CLIENT-SIDE FILTERING - instant, no API call
    this.applyClientSideFilters();
  };

  /**
   * Apply filters client-side to the unfiltered results
   * Much faster than re-querying the API
   * Also regenerates facet counts based on filtered results
   */
  private applyClientSideFilters = (): void => {
    if (Object.keys(this.activeFacets).length === 0) {
      // No filters active, show all results and regenerate facets from unfiltered results
      this.results = this.unfilteredResults;
      this.generateFacetsFromResults(this.unfilteredResults);
      return;
    }

    console.log('Applying filters:', this.activeFacets);
    console.log('Unfiltered results:', this.unfilteredResults.length);

    // Filter results based on active facets
    this.results = this.unfilteredResults.filter(result => {
      // Check each active facet type
      for (const [facetType, selectedValues] of Object.entries(this.activeFacets)) {
        if (!selectedValues || (selectedValues as string[]).length === 0) continue;

        const values = selectedValues as string[];

        // Check product attributes
        const attrs = (result as any).productData;
        if (!attrs) {
          console.log('Result has no productData:', result);
          continue;
        }

        console.log(`Checking ${facetType} for product:`, result.title, attrs);

        switch (facetType) {
          case 'category':
            if (!values.includes(attrs.category)) return false;
            break;

          case 'brand':
            if (!values.includes(attrs.brand)) return false;
            break;

          case 'availability':
            const stockStatus = attrs.inStock ? 'in_stock' : 'out_of_stock';
            if (!values.includes(stockStatus)) return false;
            break;

          case 'price_range':
            // Parse price ranges: "R25.00 - R50.00" or "R1,000.00+" (currency-agnostic)
            let matchesPrice = false;
            const price = parseFloat(attrs.price || '0');

            console.log(`Checking price ${price} against ranges:`, values);

            for (const range of values) {
              // Handle closed range: "R25.00 - R50.00" (match any currency symbol)
              const closedMatch = range.match(/([0-9,.]+)\s*-\s*([0-9,.]+)/);
              if (closedMatch) {
                const min = parseFloat(closedMatch[1].replace(/,/g, ''));
                const max = parseFloat(closedMatch[2].replace(/,/g, ''));
                if (price >= min && price <= max) {
                  console.log(`Price ${price} matches range ${min}-${max}`);
                  matchesPrice = true;
                  break;
                }
              }

              // Handle open-ended range: "R1,000.00+" (match any currency symbol)
              const openMatch = range.match(/([0-9,.]+)\+/);
              if (openMatch) {
                const min = parseFloat(openMatch[1].replace(/,/g, ''));
                if (price >= min) {
                  console.log(`Price ${price} matches ${min}+`);
                  matchesPrice = true;
                  break;
                }
              }
            }

            if (!matchesPrice) {
              console.log(`Price ${price} does not match any selected ranges`);
              return false;
            }
            break;

          case 'rating':
            // Rating values like "4" means "4+ stars"
            let matchesRating = false;
            for (const ratingStr of values) {
              const minRating = parseFloat(ratingStr);
              if (attrs.rating >= minRating) {
                matchesRating = true;
                break;
              }
            }
            if (!matchesRating) return false;
            break;
        }
      }

      return true; // Passes all filters
    });

    console.log(`Filtered ${this.unfilteredResults.length} results down to ${this.results.length}`);

    // Regenerate facets from the filtered results to show updated counts
    this.generateFacetsFromResults(this.results);
  };

  /**
   * Clear all facet filters
   */
  private clearFacets = (): void => {
    this.activeFacets = {};
    // Reset to unfiltered results
    this.results = this.unfilteredResults;
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
    console.log('renderFacetFilters called:', {
      enableFacets: this.enableFacets,
      contentType: this.contentType,
      availableFacets: this.availableFacets,
      facetKeys: Object.keys(this.availableFacets || {}),
      facetKeysLength: Object.keys(this.availableFacets || {}).length
    });

    if (!this.enableFacets || this.contentType !== 'products') {
      console.log('Facets disabled or wrong content type');
      return null;
    }
    
    // If no facets are configured in WordPress admin, don't show the facet section at all
    const win = window as any;
    const enabledFacets = win.LumenSearchSettings?.enabled_facets || {};
    const hasFacetsConfigured = Object.keys(enabledFacets).length > 0;

    if (!hasFacetsConfigured) {
      console.log('No facets configured in WordPress admin');
      return null; // Don't show facets section if admin hasn't enabled any
    }

    // If no facets have been generated yet (empty search or no results), don't show anything
    if (!this.availableFacets || Object.keys(this.availableFacets).length === 0) {
      console.log('No available facets generated from results');
      return null; // Don't show placeholder
    }

    const hasActiveFacets = Object.keys(this.activeFacets).some(key =>
      this.activeFacets[key] && this.activeFacets[key].length > 0
    );

    // Horizontal chips layout - more compact and modern
    return (
      <div class="facet-filters-horizontal">
        <div class="facet-header-horizontal">
          <span class="filter-label">Filters:</span>
          {hasActiveFacets && (
            <button class="clear-filters-link" onClick={this.clearFacets}>
              Clear all
            </button>
          )}
        </div>

        <div class="facet-chips-container">
          {/* Category chips */}
          {this.availableFacets.category && this.availableFacets.category.length > 0 && (
            <div class="facet-chip-group">
              <span class="chip-group-label">Category:</span>
              {this.availableFacets.category.slice(0, 3).map(category => (
                <button
                  class={`facet-chip ${this.activeFacets.category && this.activeFacets.category.includes(category.value) ? 'active' : ''}`}
                  onClick={() => this.handleFacetChange('category', category.value, !(this.activeFacets.category && this.activeFacets.category.includes(category.value)))}
                >
                  {category.value} <span class="chip-count">({category.count})</span>
                </button>
              ))}
            </div>
          )}

          {/* Price Range chips */}
          {this.availableFacets.price_range && this.availableFacets.price_range.length > 0 && (
            <div class="facet-chip-group">
              <span class="chip-group-label">Price:</span>
              {this.availableFacets.price_range.slice(0, 4).map(priceRange => (
                <button
                  class={`facet-chip ${this.activeFacets.price_range && this.activeFacets.price_range.includes(priceRange.range) ? 'active' : ''}`}
                  onClick={() => this.handleFacetChange('price_range', priceRange.range, !(this.activeFacets.price_range && this.activeFacets.price_range.includes(priceRange.range)))}
                >
                  <span innerHTML={this.formatPriceRange(priceRange.range)}></span> <span class="chip-count">({priceRange.count})</span>
                </button>
              ))}
            </div>
          )}

          {/* Availability chips */}
          {this.availableFacets.availability && this.availableFacets.availability.length > 0 && (
            <div class="facet-chip-group">
              <span class="chip-group-label">Stock:</span>
              {this.availableFacets.availability.map(availability => (
                <button
                  class={`facet-chip ${this.activeFacets.availability && this.activeFacets.availability.includes(availability.value) ? 'active' : ''}`}
                  onClick={() => this.handleFacetChange('availability', availability.value, !(this.activeFacets.availability && this.activeFacets.availability.includes(availability.value)))}
                >
                  {availability.value} <span class="chip-count">({availability.count})</span>
                </button>
              ))}
            </div>
          )}

          {/* Rating chips */}
          {this.availableFacets.rating && this.availableFacets.rating.length > 0 && (
            <div class="facet-chip-group">
              <span class="chip-group-label">Rating:</span>
              {this.availableFacets.rating.map(rating => (
                <button
                  class={`facet-chip ${this.activeFacets.rating && this.activeFacets.rating.includes(rating.value.toString()) ? 'active' : ''}`}
                  onClick={() => this.handleFacetChange('rating', rating.value.toString(), !(this.activeFacets.rating && this.activeFacets.rating.includes(rating.value.toString())))}
                >
                  {rating.value}+ ⭐ <span class="chip-count">({rating.count})</span>
                </button>
              ))}
            </div>
          )}

          {/* Brand chips */}
          {this.availableFacets.brand && this.availableFacets.brand.length > 0 && (
            <div class="facet-chip-group">
              <span class="chip-group-label">Brand:</span>
              {this.availableFacets.brand.slice(0, 4).map(brand => (
                <button
                  class={`facet-chip ${this.activeFacets.brand && this.activeFacets.brand.includes(brand.value) ? 'active' : ''}`}
                  onClick={() => this.handleFacetChange('brand', brand.value, !(this.activeFacets.brand && this.activeFacets.brand.includes(brand.value)))}
                >
                  {brand.value} <span class="chip-count">({brand.count})</span>
                </button>
              ))}
            </div>
          )}
        </div>
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
                        <div class="search-results-container">
                          {/* Facet filters horizontal - only for products */}
                          {this.enableFacets && this.contentType === 'products' && this.renderFacetFilters()}

                          {/* Main results */}
                          <div class="search-results-list">
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
                                      productPrice={this.parseAndFormatPrice(result.productData?.price || '')}
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
                          <div class="search-results-container modal">
                            {/* Facet filters horizontal for modal - only for products */}
                            {this.enableFacets && this.contentType === 'products' && this.renderFacetFilters()}

                            {/* Main results for modal */}
                            <div class="search-results-list">
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
                                        productPrice={this.parseAndFormatPrice(result.productData?.price || '')}
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
