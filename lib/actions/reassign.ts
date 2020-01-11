import {getDescription, getVideo, Media} from '../media';
import {Conversation, Swiper, SwiperReply} from '../Swiper';
import {logDebug} from '../terminal';
import {matchYesNo} from '../util';

export interface ReassignOptions {
  blacklist?: boolean; // When true, the reassigned torrent is also blacklisted.
}

export async function reassign(
  this: Swiper,
  convo: Conversation,
  options: ReassignOptions = {}
 ): Promise<SwiperReply> {
  const reply = await this.addStoredMediaIfFound(convo);
  if (reply) {
    return reply;
  }
  // In this case, stored media items should all represent a single video.
  const storedMedia: Media[]|null = convo.storedMedia || null;

  if (!storedMedia || storedMedia.length === 0) {
    // No matches or matches exhausted with all 'no's - search title.
    convo.commandFn = () => this.reassignIdentify(convo);
    return this.reassignIdentify(convo);
  }

  // Ask the user about a media item if they are not all dealt with.
  if (storedMedia.length > 0 && convo.input) {
    const match = matchYesNo(convo.input);
    if (match) {
      // If yes or no, shift the task to 'complete' it, then remove it from the database.
      const media: Media = storedMedia.shift()!;
      if (match === 'yes') {
        logDebug(`Swiper _reassign: Reassigning stored video`);
        // Change the command function to search on the yes-matched media item.
        convo.media = media;
        const searchOptions = {reassignTorrent: true, blacklist: options.blacklist};
        convo.commandFn = () => this.search(convo, searchOptions);
        return this.search(convo, searchOptions);
      }
    }
  }

  // Ask about a stored media item.
  return { data: getConfirmReassignString(storedMedia[0]) };
}

export async function reassignIdentify(
  this: Swiper,
  convo: Conversation,
  options: ReassignOptions = {}
): Promise<SwiperReply> {
  const media = convo.media as Media;
  if (convo.input) {
    const match = matchYesNo(convo.input);
    if (match && match === 'yes') {
      if (options.blacklist) {
        // Blacklist the torrent
        const video = getVideo(media);
        if (!video) {
          throw new Error(`_blacklist error: media item should represent a single video`);
        }
        await this.dbManager.blacklistMagnet(video.id);
      }
      // Change the command function to doReassignSearch on the yes-matched media item.
      convo.commandFn = () => this.search(convo, {reassignTorrent: true});
      return this.search(media, {reassignTorrent: true});
    } else if (match) {
      // If the client says no, complete
      return {
        data: 'Ok',
        final: true
      };
    }
  }
  // Ask about the media item.
  return { data: getConfirmReassignString(media) };
}

// Given either a Movie or Show, create a string to confirm reassigning the torrent with the user.
function getConfirmReassignString(media: Media): string {
  return `Reassign the download file for ${getDescription(media)}?`;
}
