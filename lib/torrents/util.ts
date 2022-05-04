import * as settings from '../_settings.json';
import {getFileSafeTitle} from '../common/media';

export function getTorrentString(torrent: TorrentResult): string {
  const seed = torrent.seeders ? `${torrent.seeders} peers ` : '';
  // const leech = torrent.leechers ? `${torrent.leechers} leech ` : '';
  return `*${torrent.title.replace(/\./g, ' ')}*\n` +
    `\`       \`_${torrent.sizeMb}MB with ${seed}_\n` +
    `\`       \`_${torrent.uploadTime}_`;
}

// Returns the best torrent as a match to the video. Returns null if none are decided as good.
export function getBestTorrent(video: Video, torrents: TorrentResult[]): TorrentResult|null {
  let bestTorrent = null;
  let bestTier = 0;
  torrents.forEach(t => {
    const tier = getTorrentTier(video, t);
    if (tier > bestTier) {
      bestTorrent = t;
      bestTier = tier;
    }
  });
  return bestTorrent;
}

// Get download quality tier. The tiers range from 0 <-> (2 * number of quality preferences)
function getTorrentTier(video: Video, torrent: TorrentResult): number {
  // Check if any insta-reject strings match (ex. CAMRip).
  const rejected = settings.reject.find(r =>
    torrent.title.match(new RegExp(`\\b${r}\\b`, 'gi')));
  if (rejected) { return 0; }

  // Check if the size is too big or too small.
  const sizeRule = settings.size[video.type].find(_sr => torrent.sizeMb >= _sr.minMB);
  const sizePoints = sizeRule ? sizeRule.points : 0;
  if (!sizePoints) { return 0; }

  // Get the quality preference index.
  const qualityPrefOrder = settings.quality[video.type];
  const qualityIndex = qualityPrefOrder.findIndex(q =>
    torrent.title.match(new RegExp(q, 'gi')));
  if (qualityIndex === -1) { return 0; }

  let score = 0;

  // Make sure the title matches.
  const wrongTitle = torrent.parsedTitle !== getFileSafeTitle(video);
  if (!wrongTitle) { score += 1.5; }

  // Prioritize minSeeders over having the best quality.
  const seederRule = settings.seeders.find(_sr => torrent.seeders >= _sr.min);
  const points = seederRule ? seederRule.points : 0;
  score += points;

  // Add a point relative to the index in the quality preference array.
  score += qualityPrefOrder.length - qualityIndex - 1;

  // Add correct size points
  score += sizePoints;

  return score;
}
