import {getDescription, getNextToAir} from '../media';
import {Conversation, Swiper, SwiperReply} from '../Swiper';
import {getAiredStr, getMorning} from '../util';

export async function status(this: Swiper, convo: Conversation): Promise<SwiperReply> {
  const status = await this.dbManager.getStatus();

  const monitoredStr = status.monitored.map(media => {
    if (media.type === 'movie') {
      const dvd = media.dvd && (media.dvd > getMorning());
      const dvdStr = dvd ? ` _Digital ${media.dvd!.toDateString()}_` : ` _${media.year}_`;
      return `\`  \`*${media.title}*${dvdStr}`;
    } else {
      const next = getNextToAir(media.episodes);
      return `\`  \`${getDescription(media)}` +
        ((next && next.airDate) ? ` _${getAiredStr(next!.airDate!)}_` : '');
    }
  }).join('\n');

  const downloading = status.downloading.map((video, i) => {
    const {progress, remaining, speed, peers} = this.downloadManager.getProgress(video);
    let sizeStr = '';
    if (video.size) {
      const sizeGb = video.size / 1000;
      sizeStr = `${sizeGb.toFixed(1)}GB `;
    }
    const resStr = video.resolution ? `${video.resolution} ` : ``;
    const qualStr = video.quality ? `${video.quality} ` : ``;
    const remainingStr = remaining && parseInt(remaining, 10) ? `${remaining} min at ` : '';
    return `\` ${i + 1} \`${getDescription(video)} _${progress}%_\n` +
      `\`       \`_${sizeStr}${resStr}${qualStr}_\n` +
      `\`       \`_${remainingStr}${speed}MB/s with ${peers} peers_`;
  });

  const numDownloads = status.downloading.length;
  const queued = status.queued.map((media, i) => {
    const desc = media.type === 'movie' ? media.title :
      `${getDescription(media)}`;
    return `\` ${i + numDownloads + 1} \` ${desc} _pending_`;
  });

  const downloadStr = [...downloading, ...queued].join('\n');

  const failedStr = status.failed.map(video => {
    return `\`  \`${getDescription(video)}`;
  }).join('\n');

  const strs = [];
  if (monitoredStr) {
    strs.push(`\`MONITORING\`\n${monitoredStr}`);
  }
  if (downloadStr) {
    strs.push(`\`DOWNLOADING\`\n${downloadStr}`);
  }
  if (failedStr) {
    strs.push(`\`FAILED\`\n${failedStr}`);
  }
  const str = strs.join('\n');
  return {
    data: str || "Nothing to report",
    final: true
  };
}
