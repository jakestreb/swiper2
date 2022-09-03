import db from '../../db';
import Base from './Base';
import TorrentSearch from '../../apis/TorrentSearch';
import TMDB from '../../apis/libs/TMDB';
import * as log from '../../log';

// For 'unreleased' movies without a clear release date, repeatedly search and set
// directly to 'downloading' when a torrent is found
export class CheckForRelease extends Base {
  public static UPDATE_INFO_EVERY_N_RUNS = 4;

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

    const isUpdateRun = (runCount % CheckForRelease.UPDATE_INFO_EVERY_N_RUNS) === 0;
    if (video.isMovie() && isUpdateRun) {
      try {
        log.info(`Updating release info for ${video}`);
        // Fetch updated release date info
        const updated = await TMDB.refreshReleases(video);
        await db.movies.updateReleases(updated);
      } catch (err) {
        log.error('Failed to refresh releases for ${video}: ${err}');
      }
    }

    // Wait until there's a torrent rated 4 stars or better
    const success = await TorrentSearch.addBestTorrent(video, 4);
    if (success) {
      await this.swiper.downloadManager.addToQueue(video);
      this.swiper.downloadManager.ping();
    } else if (runCount === 0) {
      await db.videos.setStatus(video, 'unreleased');
    }
    return success;
  }
}
