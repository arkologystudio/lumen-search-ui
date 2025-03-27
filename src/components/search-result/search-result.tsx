import { Component, h, Prop } from '@stencil/core';

@Component({
  tag: 'search-result',
  styleUrl: 'search-result.css',
  scoped: true,
})
export class SearchResult {
  @Prop() resultId: string = '';
  @Prop() resultTitle: string = '';
  @Prop() resultSnippet: string = '';
  @Prop() handleClick?: () => void;

  extractReadableSnippet = (snippet: string) => {
    if (!snippet) return '';

    // Match the first content between <p> tags
    const match = snippet.match(/<p>(.*?)<\/p>/);

    if (!match) return snippet; // Return original if no <p> tags found

    // Extract just the text content from the first paragraph
    // and remove any other HTML tags that might be inside
    console.log('match', match);
    return match[1].replace(/<[^>]*>/g, '');
  };

  render() {
    return (
      <div class="search-result-container" onClick={this.handleClick}>
        <h4 class="title">{this.resultTitle}</h4>
        <p class="snippet">{this.extractReadableSnippet(this.resultSnippet).slice(0, 100)}...</p>
      </div>
    );
  }
}
