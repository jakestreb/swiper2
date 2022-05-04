import Base from './Base';

export default class Episodes extends Base {
  public async init(): Promise<this> {
    await this.db.run(`CREATE TABLE IF NOT EXISTS episodes (
      id INTEGER PRIMARY KEY ON CONFLICT REPLACE,
      addedBy INTEGER,
      seasonNum INTEGER,
      episodeNum INTEGER,
      airDate DATETIME,
      showId INTEGER,
      status TEXT DEFAULT unreleased,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    return this;
  }

  public async get(id: number): Promise<Episode|null> {
    const episodes = await this.all('SELECT * FROM episodes WHERE id=?', [id]);
    return episodes.length > 0 ? episodes[0] : null;
  }

  public getWithStatus(...statuses: Status[]): Promise<Episode[]> {
    return this.all(`SELECT * FROM episodes WHERE status IN (${statuses.map(e => '?')})`, statuses);
  }

  public getFromShow(showId: number): Promise<Episode[]> {
    return this.all('SELECT * FROM episodes WHERE showId=?', [showId]);
  }

  public async setStatus(episode: Episode, status: Status): Promise<Episode> {
    if (episode.status === status) {
      return episode;
    }
    await this.db.run('UPDATE episodes SET status=? WHERE id=?', [status, episode.id]);
    return { ...episode, status };
  }

  public async addTorrents(episode: Episode): Promise<TEpisode> {
    const torrents = await this.db.torrents.getForVideo(episode.id);
    return { ...episode, torrents };
  }

  private async all(sqlCommand: string, sqlParams: any[] = []): Promise<Episode[]> {
    const rows: DBEpisode[] = await this.db.all(sqlCommand, sqlParams);
    if (rows.length === 0) {
      return [];
    }
    const show = await this.db.shows.getEmpty(rows[0].showId);
    return Promise.all(rows.map(r => rowToEpisode(r, show)));
  }

  public async insert(arg: Episode, options: DBInsertOptions): Promise<void> {
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

function rowToEpisode(row: DBEpisode, show: Show): Episode {
  return {
    ...row,
    type: 'episode',
    showTitle: show.title,
  };
}
