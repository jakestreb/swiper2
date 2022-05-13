import * as mediaUtil from '../common/media';
import * as util from '../common/util';
import db from '../db';
import TextFormatter from '../io/formatters/TextFormatter';

import Swiper from '../Swiper';

export async function remove(this: Swiper, convo: Conversation, f: TextFormatter): Promise<SwiperReply> {
  await addStoredMediaIfFound(convo);
  const storedMedia: Media[]|null = convo.storedMedia || null;
  if (!storedMedia) {
    // No matches.
    return { data: `Nothing matching ${convo.input} was found` };
  }

  // Ask the user about a media item if they are not all dealt with.
  if (storedMedia.length > 0 && convo.input) {
    const match = util.matchYesNo(convo.input);
    if (match) {
      // If yes or no, shift the task to 'complete' it, then remove it from the database.
      const media: Media = storedMedia.shift()!;
      if (match === 'yes') {
        await removeMedia(this, media);
      }
    }
  }
  // If there are still items or the match failed, send a confirm string.
  if (storedMedia.length > 0) {
    return { data: getConfirmRemovalString(storedMedia[0], f) };
  }

  return {
    data: `Ok`,
    final: true
  };
}

// Fully remove the specified media
// Destroy any active downloads of the media
// Remove any download files
// Remove any DB jobs
// Remove any DB torrents
async function removeMedia(swiper: Swiper, media: Media): Promise<void> {
  const promises = mediaUtil.getVideos(media).map(async video => {
    await swiper.worker.removeJobs(video.id);
    const withTorrents = await db.videos.addTorrents(video);
    if (withTorrents.torrents.length > 0) {
      await swiper.downloadManager.destroyAndDeleteFiles(withTorrents);
      await db.torrents.delete(...withTorrents.torrents.map(t => t.id));
    }
  });
  await Promise.all(promises);
  await db.media.delete(media);
  swiper.downloadManager.ping();
}

  // Requires mediaQuery to be set.
async function addStoredMediaIfFound(convo: Conversation): Promise<void> {
  const mediaQuery = convo.mediaQuery;
  if (!mediaQuery) {
    throw new Error(`addStoredMediaIfFound requires mediaQuery`);
  }
  // When searching stored media, we treat an unspecified episode list as all episodes.
  if (!mediaQuery.episodes) {
    mediaQuery.episodes = 'all';
  }
  // Search the database for all matching Movies/Shows.
  if (!convo.storedMedia) {
    let mediaItems = await db.media.search(mediaQuery.title, { type: mediaQuery.type || undefined });
    mediaItems = mediaUtil.filterMediaEpisodes(mediaItems, mediaQuery.episodes);
    if (mediaItems.length > 0) {
      convo.storedMedia = mediaItems;
    }
  }
}

// Given either a Movie or Show, create a string to confirm removal with the user.
function getConfirmRemovalString(media: Media, f: TextFormatter): string {
  return `Remove ${f.res(media)}?`;
}
