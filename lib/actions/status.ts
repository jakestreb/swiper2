import db from '../db';
import {getDescription, getNextToAir} from '../common/media';
import {getAiredStr, getMorning} from '../common/util';
import {Conversation, Swiper, SwiperReply} from '../Swiper';

export async function status(this: Swiper, convo: Conversation): Promise<SwiperReply> {
  const monitored = await db.media.getWithStatus('unreleased');
  const queued = await db.media.getWithStatus('queued');
  const downloading = await db.videos.getWithStatus('downloading');
  const downloadingWithTorrents = await Promise.all(downloading.map(d => db.videos.addTorrents(d)));

  const monitoredStr = monitored.map(media => {
    if (media.type === 'movie') {
      const release = media.streamingRelease && (media.streamingRelease > getMorning());
      const releaseStr = release ? ` _Streaming ${media.streamingRelease!.toDateString()}_` : ` _${media.year}_`;
      return `\`  \`*${media.title}*${releaseStr}`;
    } else {
      const next = getNextToAir(media.episodes);
      return `\`  \`${getDescription(media)}` +
        ((next && next.airDate) ? ` _${getAiredStr(next!.airDate!)}_` : '');
    }
  }).join('\n');

  const downloadingStr = downloadingWithTorrents.map((video, i) => {
    const torrentStrs = video.torrents.map(t => {
      const {progress, peers} = this.downloadManager.getProgress(t);
      const sizeStr = t.sizeMb ? `${(t.sizeMb / 1000).toFixed(1)}GB ` : '';
      const resStr = t.resolution ? `${t.resolution} ` : ``;
      const qualStr = t.quality ? `${t.quality} ` : ``;
      const peersStr = peers ? `${peers}x ` : ``;
      const progressStr = progress ? `${progress} ` : ``;
      return `\`       \`_${sizeStr}${resStr}${qualStr}${peersStr}${progressStr}_`;
    });
    return `\` ${i + 1} \`${getDescription(video)}\n` + torrentStrs.join('\n');
  });

  const numDownloads = downloading.length;
  const queuedStr = queued.map((media, i) => {
    const desc = media.type === 'movie' ? media.title :
      `${getDescription(media)}`;
    return `\` ${i + numDownloads + 1} \` ${desc} _pending_`;
  });

  const downloadStr = [...downloadingStr, ...queuedStr].join('\n');

  const strs = [];
  if (monitoredStr) {
    strs.push(`\`MONITORING\`\n${monitoredStr}`);
  }
  if (downloadStr) {
    strs.push(`\`DOWNLOADING\`\n${downloadStr}`);
  }
  const str = strs.join('\n');
  return {
    data: str || "Nothing to report",
    final: true
  };
}
