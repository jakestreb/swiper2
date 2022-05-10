import Base from './Base';

export default class Shows extends Base {
  public async init(): Promise<this> {
    await this.db.run(`CREATE TABLE IF NOT EXISTS shows (
      id INTEGER PRIMARY KEY ON CONFLICT REPLACE,
      addedBy INTEGER,
      title TEXT,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    return this;
  }

  public async getEmpty(showId: number): Promise<Show|null> {
    const result = await this.db.get(`SELECT * FROM shows WHERE id=?`, [showId]);
    return result ? rowToEmptyShow(result) : null;
  }

  // Returns shows with episodes filtered by the given statuses
  public async getWithStatus(...statuses: Status[]): Promise<Show[]> {
    const episodes: Episode[] = await this.db.episodes.getWithStatus(...statuses);
    const episodesByShow: { [showId: number]: Episode[] } = {};
    episodes.forEach(e => {
      episodesByShow[e.showId] = episodesByShow[e.showId] || [];
      episodesByShow[e.showId].push(e);
    });
    const showIds = Object.keys(episodesByShow);
    const shows: Show[] = await this.db.all(`SELECT * FROM shows WHERE id IN (${showIds.map(id => '?')})`, showIds);
    shows.forEach(s => s.episodes = episodesByShow[s.id]);
    return shows;
  }

  public search(input: string): Promise<Show[]> {
    console.warn('SERCH INPUT', input);
    return this.all('SELECT * FROM shows WHERE title LIKE ?', [`%${input}%`]);
  }

  public async insert(arg: Show, options: DBInsertOptions): Promise<void> {
    await this.db.run(`INSERT INTO shows (id, title, addedBy) VALUES (?, ?, ?)`,
        [arg.id, arg.title, options.addedBy]);
    await Promise.all(arg.episodes.map(e => this.db.episodes.insert(e, options)));
  }

  private async all(sqlCommand: string, sqlParams: any[] = []): Promise<Show[]> {
    const rows: DBShow[] = await this.db.all(sqlCommand, sqlParams);
    const shows = await Promise.all(rows.map(r => this.rowToShow(r)));
    return shows;
  }

  private async rowToShow(row: DBShow): Promise<Show> {
    const show = rowToEmptyShow(row);
    show.episodes = await this.db.episodes.getFromShow(show);
    return show;
  }
}

function rowToEmptyShow(row: DBShow): Show {
  return {
    ...row,
    type: 'tv',
    episodes: []
  };
}
