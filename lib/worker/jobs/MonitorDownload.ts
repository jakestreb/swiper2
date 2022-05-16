import * as util from '../../common/util';
import db from '../../db';
import Base from './Base';
import Swiper from '../../Swiper';

const SLOW_SPEED_MBS = 0.06;

// For 'downloading' (and 'slow') videos, check progress to update torrent status
export class MonitorDownload extends Base {
	public static schedule: JobSchedule = 'repeated';
	public static initDelayS: number = 60;

	public async run(videoId: number): Promise<boolean> {
		const video = await db.videos.get(videoId);
		if (!video) {
			throw new Error(`MonitorDownload job run on invalid videoId: ${videoId}`);
		}
		const torrents = await db.torrents.getForVideo(video.id);

    let slowToFast = torrents.filter(t => t.status === 'slow' && !isSlow(this.swiper, t));
    let fastToSlow = torrents.filter(t => t.status === 'downloading' && isSlow(this.swiper, t));

		// Wait 10s and re-check before applying statuses
		await util.delay(10000);

    slowToFast = slowToFast.filter(t => !isSlow(this.swiper, t));
    fastToSlow = fastToSlow.filter(t => isSlow(this.swiper, t));

    await Promise.all(slowToFast.map(t => db.torrents.setStatus(t, 'downloading')));
    await Promise.all(fastToSlow.map(t => db.torrents.setStatus(t, 'slow')));

		return false;
	}
}

function isSlow(swiper: Swiper, t: DBTorrent) {
  const { speed } = swiper.downloadManager.getProgress(t);
  return speed <= SLOW_SPEED_MBS;
}
