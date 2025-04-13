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

  render() {
    return (
      <div
        class="search-result-container"
        onClick={this.handleClick}
        style={{ cursor: this.resultUrl ? 'pointer' : 'default' }}
        title={this.resultUrl ? `Open in new tab: ${this.resultUrl}` : ''}
      >
        <h4 class="title">{this.resultTitle}</h4>
        <p class="snippet">
          {(() => {
            const snippet = this.extractReadableSnippet(this.resultSnippet);
            return snippet.length > 100 ? `${snippet.slice(0, 100)}...` : snippet;
          })()}
        </p>
      </div>
    );
  }
}
