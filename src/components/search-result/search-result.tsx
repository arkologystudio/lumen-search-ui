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

  extractReadableSnippet = (snippet: string) => {
    if (!snippet) return '';

    // Match the first content between <p> tags
    const match = snippet.match(/<p>(.*?)<\/p>/);

    if (!match) return snippet; // Return original if no <p> tags found

    // Extract just the text content from the first paragraph
    // and remove any other HTML tags that might be inside
    return match[1].replace(/<[^>]*>/g, '');
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
    const truncatedSnippet = snippet.length > 100 ? `${snippet.slice(0, 100)}...` : snippet;
    
    return (
      <div
        class="search-result-container post-result"
        onClick={this.handleClick}
        style={{ cursor: this.resultUrl ? 'pointer' : 'default' }}
        title={this.resultUrl ? `Open in new tab: ${this.resultUrl}` : ''}
      >
        <h4 class="title">{this.resultTitle}</h4>
        <p class="snippet">{truncatedSnippet}</p>
        {this.similarityScore > 0 && (
          <div class="result-meta">
            <span class="similarity-score">Match: {Math.round(this.similarityScore * 100)}%</span>
          </div>
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
              <p class="snippet">
                {(() => {
                  const snippet = this.extractReadableSnippet(this.resultSnippet);
                  return snippet.length > 80 ? `${snippet.slice(0, 80)}...` : snippet;
                })()}
              </p>
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
            
            {this.similarityScore > 0 && (
              <div class="result-meta">
                <span class="similarity-score">Match: {Math.round(this.similarityScore * 100)}%</span>
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
