import { Component, h, Prop } from '@stencil/core';

@Component({
  tag: 'search-result',
  styleUrl: 'search-result.css',
  shadow: true,
})
export class SearchResult {
  @Prop() resultId: string = '';
  @Prop() resultTitle: string = '';
  @Prop() resultSnippet: string = '';
  @Prop() resultUrl: string = '';
  
  // Product-specific props (optional - will be undefined for knowledge posts)
  @Prop() resultType: 'post' | 'product' = 'post'; // Default to 'post' for backward compatibility
  @Prop() productPrice: string = '';
  @Prop() productImage: string = '';
  @Prop() productRating: number = 0;
  @Prop() productInStock: boolean = true;
  @Prop() productCategory: string = '';
  @Prop() productBrand: string = '';
  @Prop() similarityScore: number = 0;

  extractReadableSnippet = (snippet: string): string => {
    if (!snippet) return '';

    // Remove HTML tags but preserve highlights if they exist
    let cleanSnippet = snippet
      .replace(/<(?!\/?(mark|strong|em)\b)[^>]*>/gi, ' ') // Remove all HTML except mark, strong, em
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim();

    // If we still have a very long snippet, try to find the most relevant part
    if (cleanSnippet.length > 300) {
      // Look for highlighted content (marked sections)
      const markMatch = cleanSnippet.match(/<mark[^>]*>([^<]+)<\/mark>/i);
      if (markMatch) {
        // Extract context around the highlighted term
        const markIndex = cleanSnippet.indexOf(markMatch[0]);
        const contextStart = Math.max(0, markIndex - 100);
        const contextEnd = Math.min(cleanSnippet.length, markIndex + markMatch[0].length + 100);
        cleanSnippet = cleanSnippet.substring(contextStart, contextEnd);
        if (contextStart > 0) cleanSnippet = '...' + cleanSnippet;
        if (contextEnd < snippet.length) cleanSnippet = cleanSnippet + '...';
      } else {
        // No highlights, just take the first 300 characters
        cleanSnippet = cleanSnippet.substring(0, 300) + '...';
      }
    }

    return cleanSnippet;
  };

  handleClick = () => {
    if (this.resultUrl) {
      window.open(this.resultUrl, '_blank', 'noopener,noreferrer');
    }
  };

  renderStars = (rating: number) => {
    const fullStars = Math.floor(rating);
    const hasHalfStar = rating % 1 >= 0.5;
    const emptyStars = 5 - fullStars - (hasHalfStar ? 1 : 0);
    
    return (
      <div class="product-rating">
        {[...Array(fullStars)].map(() => (
          <span class="star full">★</span>
        ))}
        {hasHalfStar && <span class="star half">★</span>}
        {[...Array(emptyStars)].map(() => (
          <span class="star empty">☆</span>
        ))}
        <span class="rating-value">({rating.toFixed(1)})</span>
      </div>
    );
  };

  renderPostResult = () => {
    const snippet = this.extractReadableSnippet(this.resultSnippet);
    const scorePercentage = Math.round(this.similarityScore * 1000) / 10;
    const scoreRange = scorePercentage >= 70 ? 'high' : scorePercentage >= 40 ? 'medium' : 'low';
    
    return (
      <div
        class="search-result-container post-result"
        onClick={this.handleClick}
        style={{ cursor: this.resultUrl ? 'pointer' : 'default' }}
        title={this.resultUrl ? `Open in new tab: ${this.resultUrl}` : ''}
      >
        <div class="result-header">
          <h4 class="title">{this.resultTitle}</h4>
          <div class="result-meta">
            <span 
              class="similarity-score"
              data-score={this.similarityScore === 0 ? '0' : ''}
              data-score-range={this.similarityScore > 0 ? scoreRange : ''}
            >
              {this.similarityScore > 0 ? `${scorePercentage}%` : 
               this.similarityScore === 0 ? '0%' : 'N/A'}
            </span>
          </div>
        </div>
        {snippet && (
          <div class="snippet" innerHTML={snippet}></div>
        )}
      </div>
    );
  };

  renderProductResult = () => {
    return (
      <div
        class="search-result-container product-result"
        onClick={this.handleClick}
        style={{ cursor: this.resultUrl ? 'pointer' : 'default' }}
        title={this.resultUrl ? `View product: ${this.resultUrl}` : ''}
      >
        <div class="product-content">
          {this.productImage && (
            <div class="product-image">
              <img src={this.productImage} alt={this.resultTitle} loading="lazy" />
            </div>
          )}
          <div class="product-details">
            <h4 class="title">{this.resultTitle}</h4>
            
            {(this.productBrand || this.productCategory) && (
              <div class="product-meta">
                {this.productBrand && <span class="brand">{this.productBrand}</span>}
                {this.productCategory && <span class="category">{this.productCategory}</span>}
              </div>
            )}
            
            {this.resultSnippet && (
              <div class="snippet" innerHTML={(() => {
                const snippet = this.extractReadableSnippet(this.resultSnippet);
                return snippet.length > 80 ? `${snippet.slice(0, 80)}...` : snippet;
              })()}></div>
            )}
            
            <div class="product-info">
              {this.productPrice && (
                <span class="price" innerHTML={this.productPrice}></span>
              )}
              
              {this.productRating > 0 && this.renderStars(this.productRating)}
              
              <span class={`stock-status ${this.productInStock ? 'in-stock' : 'out-of-stock'}`}>
                {this.productInStock ? 'In Stock' : 'Out of Stock'}
              </span>
            </div>
            
            {(this.similarityScore > 0 || this.similarityScore === 0) && (
              <div class="result-meta">
                <span
                  class="similarity-score"
                  data-score={this.similarityScore === 0 ? '0' : ''}
                  data-score-range={this.similarityScore > 0 ? (Math.round(this.similarityScore * 1000) / 10 >= 70 ? 'high' : Math.round(this.similarityScore * 1000) / 10 >= 40 ? 'medium' : 'low') : ''}
                >
                  Match: {this.similarityScore > 0 ? `${Math.round(this.similarityScore * 1000) / 10}%` :
                          this.similarityScore === 0 ? '0%' : 'N/A'}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  render() {
    // Intelligently detect type if not explicitly set
    const isProduct = this.resultType === 'product' || 
                     this.productPrice !== '' || 
                     this.productImage !== '' ||
                     this.productRating > 0;
    
    return isProduct ? this.renderProductResult() : this.renderPostResult();
  }
}
