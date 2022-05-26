import db from '../../db';
import Base from './Base';
import TorrentSearch from '../../apis/TorrentSearch';

// For 'unreleased' movies without a clear release date, repeatedly search and set
// directly to 'downloading' when a torrent is found
export class CheckForRelease extends Base {
  public static schedule: JobSchedule = 'repeated';
  public static initDelayS: number = 60 * 60 * 12;

  public async run(videoId: number, runCount: number): Promise<boolean> {
    const video = await db.videos.getOne(videoId);
    if (!video) {
      throw new Error(`CheckForRelease job run on invalid videoId: ${videoId}`);
    }
    const existing = await db.torrents.getForVideo(videoId);
    if (existing.length > 0) {
      // If video already has a torrent added, cancel job
      return true;
    }

    const success = await TorrentSearch.addBestTorrent(video);
    if (success) {
      await this.swiper.downloadManager.addToQueue(video);
      this.swiper.downloadManager.ping();
    } else if (runCount === 0) {
      await db.videos.setStatus(video, 'unreleased');
    }
    return success;
  }
}
