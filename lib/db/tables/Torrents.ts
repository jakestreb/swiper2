import Base from './Base';

declare interface TorrentInsertArg {
  magnet: string;
  videoId: number;
  quality: string;
  resolution: string;
  sizeMb: number;
  status: TorrentStatus;
}

export default class Torrents extends Base {
  public async init(): Promise<this> {
    await this.db.run(`CREATE TABLE IF NOT EXISTS torrents (
      id INTEGER PRIMARY KEY,
      magnet TEXT UNIQUE,
      videoId INTEGER,
      quality TEXT,
      resolution TEXT,
      sizeMb INTEGER,
      status TEXT,
      queueIndex INTEGER DEFAULT -1,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    return this;
  }

  public async getForVideo(videoId: number): Promise<DBTorrent[]> {
    return this.db.all(`SELECT * FROM torrents WHERE videoId=?`, [videoId]);
  }

  public async setStatus(torrent: DBTorrent, status: TorrentStatus): Promise<DBTorrent> {
    if (torrent.status === status) {
      return torrent;
    }
    await this.db.run('UPDATE torrents SET status=? WHERE magnet=?', [status, torrent.magnet]);
    return { ...torrent, status };
  }

  public async insert(arg: TorrentInsertArg): Promise<void> {
    await this.db.run(`INSERT INTO torrents (magnet, videoId, quality, resolution, sizeMb, status)`
    	+ ` VALUES (?, ?, ?, ?, ?, ?)`,
        [arg.magnet, arg.videoId, arg.quality, arg.resolution, arg.sizeMb, arg.status]);
  }

  public async setQueueOrder(torrents: DBTorrent[]): Promise<void> {
    await Promise.all(torrents.map((t, i) => {
      return this.db.run(`UPDATE torrents SET queueIndex=? WHERE magnet=?`, [i, t.magnet]);
    }));
  }
}
