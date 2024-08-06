import * as util from '../../util/index.js';
import db from '../../db/index.js';
import Base from './Base.js';
import logger from '../../util/logger.js';

const SLOW_SPEED_MBS = 0.02;

// For 'downloading' videos, check progress to update torrent statuses
export class MonitorDownload extends Base {
	public static INTERVAL_S = 30;
	public static MARK_SLOW_AFTER = 5; // 2.5 min
	public static ADD_TORRENT_AFTER = 30; // 15 min

	public static MAX_AUTO_TORRENTS = 3;

	public static schedule: JobSchedule = 'once';

	public slowCounts: {[id: number]: number} = {};

	public async run(videoId: number): Promise<boolean> {
		let video = await db.videos.getOne(videoId);

		while (video && video.status === 'downloading') {
			await this.manageVideo(video);

			await util.delay(MonitorDownload.INTERVAL_S * 1000);
			video = await db.videos.getOne(videoId);
		}

		// Success on completion
		return true;
	}

	private async manageVideo(video: IVideo) {
		const addAfterCount = MonitorDownload.ADD_TORRENT_AFTER;
		const maxCount = MonitorDownload.MAX_AUTO_TORRENTS;

		const allTorrents = await db.torrents.getForVideo(video.id);
		const downloading = allTorrents.filter(t => t.status === 'downloading' || t.status === 'slow');

		if (downloading.length === 0) {
			return;
		}

		// Manage individual torrents
		await Promise.all(downloading.map(async t => this.manageTorrent(t)));

		// Add new torrent if others are stuck
		const isStuck = (t: ITorrent) => !t.isUserPick && this.slowCounts[t.id] >= addAfterCount;
		const isSearching = await db.jobs.getNextRun(video.id, ['AddTorrent']);
		const count = allTorrents.length;

		if (!isSearching && downloading.every(t => isStuck(t)) && count < maxCount) {
		logger.info(`MonitorDownload: adding torrent #${count + 1} for stuck video ${video}`);
		  await this.swiper.worker.addJob({
		    type: 'AddTorrent',
		    videoId: video.id,
		    startAt: new Date(),
		  });
		}
	}

	private async manageTorrent(t: ITorrent) {
		const isSlow = await this.isSlow(t);
		const isDownloading = t.status === 'downloading';

		if (!isSlow) {
			this.slowCounts[t.id] = 0;
			if (t.status === 'slow') {
				await db.torrents.setStatus(t, 'downloading');
				this.swiper.downloadManager.ping();
			}
			return;
		}

		this.slowCounts[t.id] = this.slowCounts[t.id] || 0;
		this.slowCounts[t.id] += 1;

		// Update status to slow after a little time without progress
		if (isDownloading && this.slowCounts[t.id] >= MonitorDownload.MARK_SLOW_AFTER) {
			await db.torrents.setStatus(t, 'slow');
			this.swiper.downloadManager.ping();
		}
	}

  private async isSlow(t: ITorrent) {
    const { speed } = await this.swiper.downloadManager.getProgress(t, 5000);
    return speed !== undefined && (speed <= SLOW_SPEED_MBS);
  }
}
