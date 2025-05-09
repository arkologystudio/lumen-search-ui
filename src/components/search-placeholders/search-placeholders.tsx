import { Component, h, Prop } from '@stencil/core';

interface PlaceholderItem {
  title: string;
  subtitle: string;
}

@Component({
  tag: 'search-placeholders',
  styleUrl: 'search-placeholders.css',
  shadow: true,
})
export class SearchPlaceholders {
  @Prop() isVisible: boolean = true;
  @Prop() selectPlaceholder: (subtitle: string) => void;

  // Default example searches
  private placeholders: PlaceholderItem[] = [
    {
      title: 'Query the Culture Hack curriculum',
      subtitle: 'What is a listening model?',
    },
    {
      title: 'Query in any language',
      subtitle: '¿Qué es un modelo de escucha?',
    },
    {
      title: 'Find results with semantic search',
      subtitle: 'How to orient towards justice?',
    },
  ];

  private handlePlaceholderClick = (subtitle: string): void => {
    console.log('Placeholder clicked:', subtitle);
    this.selectPlaceholder(subtitle);
  };

  componentWillRender() {
    console.log('Search placeholders rendering, isVisible:', this.isVisible);
  }

  render() {
    console.log('Rendering search placeholders component');

    if (!this.isVisible) {
      console.log('Placeholders not visible due to isVisible prop');
      return null;
    }

    return (
      <div class="placeholders-container">
        <h4 class="placeholders-heading">Use this tool to</h4>
        <div class="placeholders-list">
          {this.placeholders.map(placeholder => (
            <div class="placeholder-item" onClick={() => this.handlePlaceholderClick(placeholder.subtitle)}>
              <h4 class="title">{placeholder.title}</h4>
              <p class="subtitle">{placeholder.subtitle}</p>
            </div>
          ))}
        </div>
      </div>
    );
  }
}
