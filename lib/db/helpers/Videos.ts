export default class Videos {
  constructor(public db: any) {}

  public async get(id: number): Promise<IVideo|null> {
    const movie = await this.db.movies.get(id);
    const episode = await this.db.episodes.get(id);
    return movie || episode;
  }

  public async getWithStatus(...statuses: Status[]): Promise<IVideo[]> {
    const movies = await this.db.movies.getWithStatus(...statuses);
    const episodes = await this.db.episodes.getWithStatus(...statuses);
    return movies.concat(episodes);
  }

  public async setStatus(video: IVideo, status: Status): Promise<void> {
    if (video.isMovie()) {
      return this.db.movies.setStatus(video as IMovie, status);
    }
    return this.db.episodes.setStatus(video as IEpisode, status);
  }

  public async addTorrents(video: IVideo): Promise<TVideo> {
    const torrents = await this.db.torrents.getForVideo(video.id);
    return { ...video, torrents };
  }

  public async saveStatuses(videos: IVideo[]): Promise<void> {
    await Promise.all(videos.map(v => this.setStatus(v, v.status)));
  }

  public async delete(videoId: number): Promise<void> {
    await this.db.movies.delete(videoId);
    await this.db.episodes.delete(videoId);
  }

  public async setQueueOrder(videos: IVideo[]): Promise<void> {
    await Promise.all(videos.map((v, i) => {
      if (v.isMovie()) {
        return this.db.run(`UPDATE movies SET queueIndex=? WHERE id=?`, [i, v.id]);
      }
      return this.db.run(`UPDATE episodes SET queueIndex=? WHERE id=?`, [i, v.id]);
    }));
  }
}
