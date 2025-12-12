import ptn from 'parse-torrent-name';
import db from '../db/index.js';
import * as matchUtil from './helpers/matchUtil.js';
import logger from '../util/logger.js';
import Swiper from '../Swiper.js';
import TorrentSearch from '../functions/search/TorrentSearch.js';
import { formatSelection, compareHashes, PER_PAGE } from './search.js';
import MediaParser from '../functions/identify/MediaParser.js';

export async function manualSearch(this: Swiper, convo: Conversation): Promise<SwiperReply> {
  logger.debug(`Swiper: manualSearch`);
  const f = this.getTextFormatter(convo);

  // Get the search term from input - use it exactly as provided
  // Handle both "manual search <term>" and "manualsearch <term>" formats
  let searchTerm = convo.input?.trim() || '';
  if (searchTerm.toLowerCase().startsWith('search ')) {
    searchTerm = searchTerm.substring(7).trim();
  }
  
  if (!searchTerm) {
    return {
      data: 'Please provide a search term. Usage: manual search <search term>',
      final: true
    };
  }

  // Perform the search with the raw term - no media identification
  if (!convo.torrents) {
    await this.notifyClient(convo.id, `Searching for "${searchTerm}" torrents`);
    const results = await TorrentSearch.searchByTerm(searchTerm);
    convo.torrents = results;
    convo.pageNum = 0;
  }

  if (convo.torrents!.length === 0) {
    return {
      data: 'No torrents found',
      final: true
    };
  }

  // Display the torrents to the user.
  convo.pageNum = convo.pageNum || 0;

  const showPage = async () => {
    const { torrents, pageNum } = convo;
    return {
      data: await formatSelection(torrents!, pageNum!, f),
    };
  };

  const startIndex = PER_PAGE * convo.pageNum;
  const navs = [];
  if (startIndex > 0) {
    navs.push({value: 'prev', regex: /\bp(rev)?(ious)?\b/gi});
  }
  if (startIndex + PER_PAGE < convo.torrents.length) {
    navs.push({value: 'next', regex: /\bn(ext)?\b/gi});
  }
  const match = matchUtil.matchNumber(convo.input, navs);
  if (match === 'next') {
    convo.pageNum += 1;
    return showPage();
  } else if (match === 'prev') {
    convo.pageNum -= 1;
    return showPage();
  } else if (match === null) {
    return showPage();
  }

  // Matched a number - user selected a torrent
  const torrentNum = parseInt(convo.input || '', 10);
  if (!torrentNum || torrentNum <= 0 || torrentNum > convo.torrents.length) {
    return showPage();
  }
  const torrent = convo.torrents[torrentNum - 1];

  // Parse torrent title to get basic info (no TMDB/TVDB lookup)
  const parsed = ptn(torrent.title);
  const title = parsed.title || torrent.title.split(/[\.\-_]/)[0].trim() || 'Unknown';
  const season = parsed.season;
  const episode = parsed.episode;
  const year = parsed.year ? String(parsed.year) : null;

  // Create media query from parsed torrent (but don't search TMDB/TVDB)
  const episodes: EpisodesDescriptor | null = (season && episode) ? { [season]: [episode] } : null;
  const type: 'movie'|'tv'|null = episodes ? 'tv' : 'movie';
  convo.mediaQuery = { title, type, episodes, year };
  convo.input = '';

  // Use MediaParser to create media object (this will still try TMDB, but we'll handle failures)
  const parser = new MediaParser({ requireVideo: true });
  const mediaReply = await parser.addMedia(convo, f);
  if (mediaReply) {
    // If media identification failed, we can't proceed without a video object
    return {
      data: 'Unable to identify media. Please use regular search command to identify the show/movie first, then use manual search.',
      final: true
    };
  }

  const media = convo.media as IMedia;
  const video = media.isShow() ? media.episodes[0] : media as IMovie;
  const active = await db.torrents.getForVideo(video.id);

  if (active.some(at => compareHashes(torrent.hash, at.hash))) {
    return {
      data: 'This torrent is already added',
      final: true
    };
  }

  // Add torrent to existing video, if there is one
  const existing = await db.videos.getOne(video.id);
  if (existing && existing.status === 'downloading' && active.length > 0) {
    await db.torrents.insert({
      ...torrent,
      videoId: video.id,
      status: 'pending',
      isUserPick: true,
    });
    await this.downloadManager.ping();
    return {
      data: `Added new torrent for ${video.format(f)}`,
      final: true
    };
  }

  // Try to add video
  try {
    await db.media.insert(media, { addedBy: convo.id, status: 'identified' });
  } catch (err: any) {
    if (err.code !== 'SQLITE_CONSTRAINT') {
      throw err;
    }
    return {
      data: 'Video must be removed before re-downloading',
      final: true
    };
  }

  // Add torrent and add video to queue
  await db.torrents.insert({
    ...torrent,
    videoId: video.id,
    status: 'pending',
    isUserPick: true,
  });
  await this.downloadManager.addToQueue(video);

  return {
    data: f.multiMessage(
      `Queued ${video.format(f)} for download`,
      f.commands('queue')
    ),
    final: true
  };
}
