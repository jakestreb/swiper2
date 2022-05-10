export default class MediaHandler {
  constructor(public db: any) {}

  // Searches movie and tv tables for titles that match the given input. If the type is
  // specified in the options, only that table is searched. Returns all matches as ResultRows.
  public async search(input: string, options: DBSearchOptions): Promise<Media[]> {
    const rows: Media[] = [];
    if (options.type !== 'tv') {
      // Search Movies
      rows.push(...await this.db.movies.search(input));
    }
    if (options.type !== 'movie') {
      // Search Shows
      rows.push(...await this.db.shows.search(input));
    }
    return rows;
  }

  public async insert(media: Media, options: DBInsertOptions): Promise<void> {
    if (media.type === 'movie') {
      await this.db.movies.insert(media as Movie, options);
    } else {
      await this.db.shows.insert(media as Show, options);
    }
  }

  public async delete(media: Media): Promise<void> {
    if (media.type === 'movie') {
      await this.db.movies.delete(media.id);
    } else {
      await this.db.episodes.delete(...media.episodes.map(e => e.id));
    }
  }

  public async getWithStatus(...statuses: Status[]): Promise<Media[]> {
    const movies = await this.db.movies.getWithStatus(...statuses);
    const shows = await this.db.shows.getWithStatus(...statuses);
    return movies.concat(shows);
  }

  public async setStatus(media: Media, status: Status): Promise<void> {
    const videos: Video[] = [];
    if (media.type === 'movie') {
      videos.push(media);
    } else {
      videos.push(...media.episodes);
    }
    await Promise.all(videos.map(v => this.db.videos.setStatus(v, status)));
  }
}
