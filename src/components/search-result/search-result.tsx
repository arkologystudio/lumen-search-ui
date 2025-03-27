import { Component, h, Prop } from "@stencil/core";

@Component({
  tag: "search-result",
  styleUrl: "search-result.css",
  scoped: true,
})
export class SearchResult {
  @Prop() resultId: string = "";
  @Prop() resultTitle: string = "";
  @Prop() resultSnippet: string = "";
  @Prop() handleClick?: () => void;

  render() {
    return (
      <div class="search-result" onClick={this.handleClick}>
        <h3 class="title">{this.resultTitle}</h3>
        <p class="snippet">{this.resultSnippet}</p>
      </div>
    );
  }
}
