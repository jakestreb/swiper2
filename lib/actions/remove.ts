import db from '../db';
import {getDescription} from '../common/media';
import {matchYesNo} from '../common/util';
import Swiper from '../Swiper';

export async function remove(swiper: Swiper, convo: Conversation): Promise<SwiperReply> {
  const reply = await swiper.addStoredMediaIfFound(convo);
  if (reply) {
    return reply;
  }
  const storedMedia: Media[]|null = convo.storedMedia || null;

  if (!storedMedia) {
    // No matches.
    return { data: `Nothing matching ${convo.input} was found` };
  }

  // Ask the user about a media item if they are not all dealt with.
  if (storedMedia.length > 0 && convo.input) {
    const match = matchYesNo(convo.input);
    if (match) {
      // If yes or no, shift the task to 'complete' it, then remove it from the database.
      const media: Media = storedMedia.shift()!;
      if (match === 'yes') {
        await db.media.delete(media);
        // After a removal, ping the download manager.
        swiper.downloadManager.ping();
      }
    }
  }
  // If there are still items or the match failed, send a confirm string.
  if (storedMedia.length > 0) {
    return { data: getConfirmRemovalString(storedMedia[0]) };
  }

  return {
    data: `Ok`,
    final: true
  };
}

// Given either a Movie or Show, create a string to confirm removal with the user.
function getConfirmRemovalString(media: Media): string {
  return `Remove ${getDescription(media)}?`;
}
