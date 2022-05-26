export default class MediaHandler {
  constructor(public db: any) {}

  // Searches movie and tv tables for titles that match the given input. If the type is
  // specified in the options, only that table is searched. Returns all matches as ResultRows.
  public async search(input: string, options: DBSearchOptions): Promise<IMedia[]> {
    const rows: IMedia[] = [];
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

  public async insert(media: IMedia, options: DBInsertOptions): Promise<void> {
    if (media.isMovie()) {
      await this.db.movies.insert(media as IMovie, options);
    } else {
      await this.db.shows.insert(media as IShow, options);
    }
  }

  public async delete(media: IMedia): Promise<void> {
    if (media.isMovie()) {
      await this.db.movies.delete(media.id);
    } else if (media.isShow()) {
      await this.db.episodes.delete(...media.episodes.map(e => e.id));
    }
  }

  public async getWithStatus(...statuses: Status[]): Promise<IMedia[]> {
    const movies = await this.db.movies.getWithStatus(...statuses);
    const shows = await this.db.shows.getWithStatus(...statuses);
    return movies.concat(shows);
  }

  public async setStatus(media: IMedia, status: Status): Promise<void> {
    const videos: IVideo[] = [];
    if (media.isMovie()) {
      videos.push(media);
    } else if (media.isShow()) {
      videos.push(...media.episodes);
    }
    await Promise.all(videos.map(v => this.db.videos.setStatus(v, status)));
  }
}
