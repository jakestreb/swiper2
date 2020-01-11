import {getDescription, Media} from '../media';
import {settings} from '../settings';
import {Conversation, Swiper, SwiperReply, SearchOptions} from '../Swiper';
import {log, logDebug} from '../terminal';
import {assignMeta, getTorrentString, Torrent} from '../torrent';
import {matchNumber} from '../util';

export async function search(this: Swiper, convo: Conversation, options: SearchOptions = {}): Promise<SwiperReply> {
  logDebug(`Swiper: search`);

  const media = convo.media as Media;
  const video = media.type === 'tv' ? media.episodes[0] : media;
  const videoMeta = await this.dbManager.addMetadata(video);

  // Perform the search and add the torrents to the conversation.
  if (!convo.torrents) {
    log(`Searching for ${getDescription(video)} downloads`);
    convo.torrents = await this.searchClient.search(video);
    convo.pageNum = 0;
  }

  if (convo.torrents.length === 0) {
    return {
      data: `No torrents found`,
      final: true
    };
  }

  // Display the torrents to the user.
  convo.pageNum = convo.pageNum || 0;

  const showPage = () => showTorrents(convo.torrents!, convo.pageNum!,
    videoMeta.magnet || undefined, videoMeta.blacklisted);

  const startIndex = settings.torrentsPerPage * convo.pageNum;
  const navs = [];
  if (startIndex > 0) {
    navs.push({value: 'prev', regex: /\bp(rev)?(ious)?\b/gi});
  }
  if (startIndex + settings.torrentsPerPage < convo.torrents.length) {
    navs.push({value: 'next', regex: /\bn(ext)?\b/gi});
  }
  const match = matchNumber(convo.input, navs);
  if (match === 'next') {
    // Go forward a page.
    convo.pageNum += 1;
    return showPage();
  } else if (match === 'prev') {
    // Go back a page.
    convo.pageNum -= 1;
    return showPage();
  } else if (match === null) {
    // No match - no change.
    return showPage();
  }

  // Matched a number
  const torrentNum = parseInt(convo.input || '', 10);
  if (!torrentNum || torrentNum <= 0 && torrentNum > convo.torrents.length) {
    // Invalid number - show torrents again.
    return showPage();
  }
  const torrent = convo.torrents[torrentNum - 1];

  // Assign the torrent magnet to the video and queue it for download.
  if (options.reassignTorrent) {
    // Stop downloading and ping the download manager so it's able to start up the download
    // again afterward.
    await this.dbManager.markAsFailed(video);
    await this.downloadManager.pingAndWait();
    if (options.blacklist) {
      await this.dbManager.blacklistMagnet(video.id);
    }
  }
  await this.dbManager.addToQueued(media, convo.id);
  await this.dbManager.setTorrent(video.id, torrent);
  assignMeta(video, torrent);
  this.downloadManager.ping();

  return {
    data: `Queued ${getDescription(video)} for download`,
    final: true
  };
}

// Show a subset of the torrents decided by the pageNum.
function showTorrents(
  torrents: Torrent[],
  pageNum: number,
  lastMagnet: string = '',
  blacklisted: string[] = []
): SwiperReply {
  const startIndex = settings.torrentsPerPage * pageNum;
  const prev = startIndex > 0;
  const next = (startIndex + settings.torrentsPerPage) < torrents.length;
  const someTorrents = torrents.slice(startIndex, startIndex + settings.torrentsPerPage);
  const torrentRows = someTorrents.map((t, i) => {
    const repeatStr = t.magnet === lastMagnet ? '(Prev selection) ' : '';
    const blacklistStr = blacklisted.includes(t.magnet) ? '(BLACKLISTED) ' : '';
    return `\` ${startIndex + i + 1} \`_${blacklistStr || repeatStr}_${getTorrentString(t)}`;
  });
  const respStr = prev && next ? `\`prev\` or \`next\`` : (next ? `\`next\`` : (prev ? `\`prev\`` : ``));
  const str = torrentRows.join(`\n`);
  return {
    data: `${str}\n\nGive \`num\` to download` + (respStr ? ` or ${respStr} to see more` : ``)
  };
}

