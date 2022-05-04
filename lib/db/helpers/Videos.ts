import * as settings from '../../_settings.json';

export default class Videos {
  constructor(public db: any) {}

  public async getWithStatus(...statuses: Status[]): Promise<Video[]> {
    const movies = await this.db.movies.getWithStatus(...statuses);
    const episodes = await this.db.episodes.getWithStatus(...statuses);
    return movies.concat(episodes);
  }

  public async setStatus(video: Video, status: Status): Promise<Video> {
    if (video.type === 'movie') {
      return this.db.movies.setStatus(video as Movie, status);
    }
    return this.db.episodes.insert(video as Episode, status);
  }

  public async addTorrents(video: Video): Promise<TVideo> {
    const torrents = await this.db.torrents.getForVideo(video);
    return { ...video, torrents };
  }

  // Updates the downloading items if the queue order or count has changed. After this function
  // is run, top n queued videos should be set to isDownloading.
  // Returns all videos that are now set to download.
  public async manageDownloads(): Promise<TVideo[]> {
    const movies = await this.db.movies.getWithStatus('downloading', 'queued');
    const episodes = await this.db.episodes.getWithStatus('downloading', 'queued');
    const all: Video[] = movies.concat(episodes);

    // TODO: Sort by priority

    const max = settings.maxDownloads;

    // Update the database.
    const promises = all.map((v, i) => this.setStatus(v, i < max ? 'downloading' : 'queued'));
    const results = await Promise.all(promises);

    return Promise.all(results.slice(0, max).map(v => this.addTorrents(v)));
  }

  public async delete(video: Video): Promise<void> {
    if (video.type === 'movie') {
      return this.db.movies.delete(video.id);
    }
    return this.db.episodes.delete(video.id);
  }
}
