export default abstract class ResourcePriority<T> {
  public abstract ranks: T[];
  public abstract predicate: (v: T, t: TorrentResult) => boolean;
  public abstract scale: number;

  constructor(public video: Video) {}

  public getScore(t: TorrentResult) {
    const index = this.ranks.findIndex(val => this.predicate(val, t));
    if (index === -1) {
      return -1;
    }
    if (this.ranks.length === 1) {
      return 0;
    }
    const score = (this.ranks.length - index - 1) / (this.ranks.length - 1);
    return score * this.scale;
  }
}
