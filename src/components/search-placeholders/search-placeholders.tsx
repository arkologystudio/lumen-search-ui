import { Component, h, Prop } from '@stencil/core';

export interface PlaceholderItem {
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
  @Prop() customStyles: any = {};
  @Prop() placeholders: PlaceholderItem[] = [
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

    // Don't render anything if there are no placeholders or placeholders array is empty
    if (!this.placeholders || this.placeholders.length === 0) {
      console.log('No placeholders to display');
      return null;
    }

    const placeholderItemStyle = {
      backgroundColor: this.customStyles.placeholder_bg || '#f8f9fa',
      borderRadius: this.customStyles.border_radius || '4px',
      fontFamily: this.customStyles.font_family || 'inherit',
    };

    const titleStyle = {
      color: this.customStyles.text_color || '#333333',
      fontSize: this.customStyles.font_size || '16px',
    };

    const subtitleStyle = {
      color: this.customStyles.text_color || '#666666',
      fontSize: `calc(${this.customStyles.font_size || '16px'} * 0.875)`,
    };

    return (
      <div class="placeholders-container">
        <h4 class="placeholders-heading" style={titleStyle}>Use this tool to</h4>
        <div class="placeholders-list">
          {this.placeholders.map(placeholder => (
            <div 
              class="placeholder-item" 
              onClick={() => this.handlePlaceholderClick(placeholder.subtitle)}
              style={placeholderItemStyle}
            >
              <h4 class="title" style={titleStyle}>{placeholder.title}</h4>
              <p class="subtitle" style={subtitleStyle}>{placeholder.subtitle}</p>
            </div>
          ))}
        </div>
      </div>
    );
  }
}
