import * as util from '../../util';
import db from '../../db';
import Base from './Base';

const SLOW_SPEED_MBS = 0.2;

// For 'downloading' (and 'slow') videos, check progress to update torrent status
export class MonitorDownload extends Base {
	public static schedule: JobSchedule = 'repeated';
	public static initDelayS: number = 60;

	public async run(videoId: number): Promise<boolean> {
		const video = await db.videos.getOne(videoId);
		if (!video) {
			throw new Error(`MonitorDownload job run on invalid videoId: ${videoId}`);
		}
		if (video.status !== 'downloading') {
			// Done monitoring
			return true;
		}

		const torrents = await db.torrents.getForVideo(video.id);

    let slowToFast = torrents.filter(t => t.status === 'slow' && !this.isSlow(t));
    let fastToSlow = torrents.filter(t => t.status === 'downloading' && this.isSlow(t));

		// Wait 10s and re-check before applying statuses
		await util.delay(10000);

    slowToFast = slowToFast.filter(t => !this.isSlow(t));
    fastToSlow = fastToSlow.filter(t => this.isSlow(t));

    await Promise.all(slowToFast.map(t => db.torrents.setStatus(t, 'downloading')));
    await Promise.all(fastToSlow.map(t => db.torrents.setStatus(t, 'slow')));

		return false;
	}

  private isSlow(t: ITorrent) {
    const { speed } = this.swiper.downloadManager.getProgress(t);
    console.warn('SPEED', t.id, speed);
    return speed <= SLOW_SPEED_MBS;
  }
}
