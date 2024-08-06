import db from '../db/index.js';
import * as util from '../util/index.js';
import Swiper from '../Swiper.js';

const UP_ARROW = '\u2191';
const DOWN_ARROW = '\u2913';
const HOURGLASS = '\u29D6';
const X = '\u2A09';

const EXPORTING = '(exporting)';

export async function queued(this: Swiper, convo: Conversation): Promise<SwiperReply> {
  const f = this.getTextFormatter(convo);

  const downloading = await db.videos.getWithStatus('searching', 'downloading', 'exporting');
  const completed = await db.media.getWithStatus('completed');
  const downloadingWithTorrents = await Promise.all(downloading.map(d => db.videos.addTorrents(d)));
  const sorted = util.sortByPriority(downloadingWithTorrents, getSortPriority);

  const downloadRows = await Promise.all(sorted.map(async video => {
    const torrentRows = await Promise.all(video.torrents.map(async t => {
      const { progress, peers } = await this.downloadManager.getProgress(t, 2000);
      return `${f.sp(2)}${t.format(f, peers, progress)}`;
    }));
    const searchTxt = await getSearchTxt(video);
    const rows = [`${getIcon(video)} ${video.format(f)}`];
    if (video.status === 'downloading' && torrentRows.length > 0) {
      rows.push(torrentRows.join('\n'));
    }
    if (searchTxt) {
      rows.push(`${f.sp(2)}${searchTxt}`);
    }
    if (video.status === 'exporting') {
      rows.push(`${f.sp(2)}${EXPORTING}`);
    }
    return rows.join('\n');
  }));
  const completedRows = completed.map(media => {
      return `${X} ${formatCompleted(media, f)}`;
  });
  const rows = [...downloadRows, ...completedRows];

  return {
    data: rows.length > 0 ? rows.join('\n') : 'No downloads',
    final: true
  };
}

async function getSearchTxt(video: IVideo): Promise<string|null> {
  const jobTypes: JobType[] = ['AddTorrent', 'CheckForRelease', 'StartSearching'];
  const nextRun = await db.jobs.getNextRun(video.id, jobTypes);
  if (!nextRun) {
    return null;
  } else if (nextRun.getTime() < Date.now()) {
    return '(searching)';
  }
  return `(searching in ${util.formatWaitTime(nextRun)})`;
}

function formatCompleted(media: IMedia, f: TextFormatter) {
  return f.s(media.format(f));
}

function getIcon(video: TVideo) {
  if (video.status === 'completed') {
    return '';
  }
  const isDownloading = video.torrents.some(t => t.status === 'downloading');
  const isExporting = video.status === 'exporting';
  return isDownloading ? DOWN_ARROW : (isExporting ? UP_ARROW : HOURGLASS);
}

function getSortPriority(video: IVideo) {
  const queueIndex = video.status === 'downloading' ? video.queueIndex! : -1;
  const season = video.isEpisode() ? video.seasonNum : 0;
  const episode = video.isEpisode() ? video.episodeNum : 0;
  return [
    video.status === 'exporting',
    video.status === 'downloading',
    video.status === 'searching',
    queueIndex >= 0,
    -queueIndex,
    -season,
    -episode
  ];
}
