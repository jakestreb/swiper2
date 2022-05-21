import Torrent from '../../res/Torrent';
import Base from './Base';

interface TorrentInsertArg {
  magnet: string;
  videoId: number;
  quality: string;
  resolution: string;
  sizeMb: number;
  status: TorrentStatus;
}

interface TorrentDBRow {
  id: number;
  magnet: string;
  videoId: number;
  quality: string;
  resolution: string;
  sizeMb: number;
  status: TorrentStatus;
  queueIndex: number;
  createdAt: Date;
}

export default class Torrents extends Base<TorrentDBRow, ITorrent> {
  public async init(): Promise<this> {
    await this.run(`CREATE TABLE IF NOT EXISTS torrents (
      id INTEGER PRIMARY KEY,
      magnet TEXT UNIQUE ON CONFLICT REPLACE,
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

  public buildInstance(row: TorrentDBRow): ITorrent {
    return new Torrent(row);
  }

  public async getForVideo(videoId: number): Promise<ITorrent[]> {
    return this.all(`SELECT * FROM torrents WHERE videoId=?`, [videoId]);
  }

  public async setStatus(torrent: ITorrent, status: TorrentStatus): Promise<ITorrent> {
    if (torrent.status === status) {
      return torrent;
    }
    await this.run('UPDATE torrents SET status=? WHERE id=?', [status, torrent.id]);
    return { ...torrent, status };
  }

  public async insert(arg: TorrentInsertArg): Promise<void> {
    await this.run(`INSERT INTO torrents (magnet, videoId, quality, resolution, sizeMb, status)`
    	+ ` VALUES (?, ?, ?, ?, ?, ?)`,
        [arg.magnet, arg.videoId, arg.quality, arg.resolution, arg.sizeMb, arg.status]);
  }

  public async setQueueOrder(torrents: ITorrent[]): Promise<void> {
    await Promise.all(torrents.map((t, i) => {
      return this.run(`UPDATE torrents SET queueIndex=? WHERE id=?`, [i, t.id]);
    }));
  }

  public async delete(...ids: number[]): Promise<void> {
    await this.run(`DELETE FROM torrents WHERE id IN (${ids.map(e => '?')})`, ids);
  }
}
