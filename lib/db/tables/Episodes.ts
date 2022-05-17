import Episode from '../../res/Episode';
import Base from './Base';

export default class Episodes extends Base<IEpisode> {
  public async init(): Promise<this> {
    await this.db.run(`CREATE TABLE IF NOT EXISTS episodes (
      id INTEGER PRIMARY KEY,
      seasonNum INTEGER,
      episodeNum INTEGER,
      airDate DATETIME,
      showId INTEGER,
      status TEXT DEFAULT unreleased,
      queueIndex INTEGER DEFAULT -1,
      addedBy INTEGER,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    return this;
  }

  public async buildInstance(row: any): Promise<IEpisode> {
    const show = await this.db.shows.getEmpty(row.showId);
    return new Episode({ ...row, type: 'episode', showTitle: show.title });
  }

  public async getOne(id: number): Promise<IEpisode|void> {
    return this.get('SELECT * FROM episodes WHERE id=? LIMIT 1', [id]);
  }

  public getWithStatus(...statuses: Status[]): Promise<IEpisode[]> {
    return this.all(`SELECT * FROM episodes WHERE status IN (${statuses.map(e => '?')})`, statuses);
  }

  public getFromShow(showId: number): Promise<IEpisode[]> {
    return this.all('SELECT * FROM episodes WHERE showId=?', [showId]);
  }

  public async setStatus(episode: IEpisode, status: Status): Promise<IEpisode> {
    if (episode.status === status) {
      return episode;
    }
    await this.db.run('UPDATE episodes SET status=? WHERE id=?', [status, episode.id]);
    return { ...episode, status };
  }

  public async addTorrents(episode: IEpisode): Promise<TEpisode> {
    const torrents = await this.db.torrents.getForVideo(episode.id);
    return { ...episode, torrents };
  }

  public async insert(arg: IEpisode, options: DBInsertOptions): Promise<void> {
    await this.db.run(`INSERT INTO episodes (id, seasonNum, episodeNum, airDate, ` +
        `showId, status, addedBy) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [arg.id, arg.seasonNum, arg.episodeNum, arg.airDate, arg.showId,
          options.status, options.addedBy]);
  }

  public async delete(...ids: number[]): Promise<void> {
    await this.db.run(`DELETE FROM episodes WHERE id IN (${ids.map(e => '?')})`, ids);
    // Delete show if no episodes remain
    await this.db.run(`DELETE FROM shows WHERE id NOT IN (SELECT showId FROM episodes)`);
  }
}
