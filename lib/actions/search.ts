import db from '../db';
import * as log from '../common/logger';
import {getDescription} from '../common/media';
import {matchNumber} from '../common/util';
import Swiper from '../Swiper';
import TorrentSearch from '../apis/TorrentSearch';

// Number of torrents to show per page
const PER_PAGE = 4;

export async function search(this: Swiper, convo: Conversation): Promise<SwiperReply> {
  log.debug(`Swiper: search`);

  const media = convo.media as Media;
  const video = media.type === 'tv' ? media.episodes[0] : media;
  const videoWithTorrents = await db.videos.addTorrents(video);

  // Perform the search and add the torrents to the conversation.
  if (!convo.torrents) {
    log.info(`Searching for ${getDescription(video)} downloads`);
    convo.torrents = await TorrentSearch.search(video);
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
    videoWithTorrents.torrents);

  const startIndex = PER_PAGE * convo.pageNum;
  const navs = [];
  if (startIndex > 0) {
    navs.push({value: 'prev', regex: /\bp(rev)?(ious)?\b/gi});
  }
  if (startIndex + PER_PAGE < convo.torrents.length) {
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

  await db.media.insert(media, { addedBy: convo.id, status: 'downloading' });
  await db.torrents.insert({ ...torrent, videoId: video.id, status: 'paused' });
  this.downloadManager.ping();

  return {
    data: `Queued ${getDescription(video)} for download`,
    final: true
  };
}

// Show a subset of the torrents decided by the pageNum.
function showTorrents(
  torrents: TorrentResult[],
  pageNum: number,
  currentTorrents: DBTorrent[],
): SwiperReply {
  const startIndex = PER_PAGE * pageNum;
  const prev = startIndex > 0;
  const next = (startIndex + PER_PAGE) < torrents.length;
  const someTorrents = torrents.slice(startIndex, startIndex + PER_PAGE);
  const torrentRows = someTorrents.map((t, i) => {
    const isRepeat = currentTorrents.find(ct => t.magnet === ct.magnet);
    const repeatStr = isRepeat ? '(Prev selection) ' : '';
    return `\` ${startIndex + i + 1} \`_${repeatStr}_${getTorrentString(t)}`;
  });
  const respStr = prev && next ? `\`prev\` or \`next\`` : (next ? `\`next\`` : (prev ? `\`prev\`` : ``));
  const str = torrentRows.join(`\n`);
  return {
    data: `${str}\n\nGive \`num\` to download` + (respStr ? ` or ${respStr} to see more` : ``)
  };
}

function getTorrentString(torrent: TorrentResult): string {
  const seed = torrent.seeders ? `${torrent.seeders} peers ` : '';
  // const leech = torrent.leechers ? `${torrent.leechers} leech ` : '';
  return `*${torrent.title.replace(/\./g, ' ')}*\n` +
    `\`       \`_${torrent.sizeMb}MB with ${seed}_\n` +
    `\`       \`_${torrent.uploadTime}_`;
}
