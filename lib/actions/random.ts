import {getDescription} from '../media';
import {Conversation, Swiper, SwiperReply} from '../Swiper';
import {matchYesNo} from '../util';

// Time before a random movie is suggested again (3 months)
const TIMEOUT = 3 * 30 * 24 * 60 * 60 * 1000;

export async function random(this: Swiper, convo: Conversation): Promise<SwiperReply> {
  if (convo.media && convo.input) {
    // Responding whether to download
    const match = matchYesNo(convo.input);
    if (match === 'yes') {
      await this.dbManager.addToQueued(convo.media, convo.id);
      this.downloadManager.ping();
      return {
        data: `Queued ${getDescription(convo.media)} for download`,
        final: true
      };
    } else if (match === 'no') {
      convo.media = undefined;
    } else {
      return {
        data: `Download ${getDescription(convo.media)}?`,
      }
    }
  }
  // Add media if not present and ask to download
  if (!convo.media) {
    const [movie] = await this.dbManager.getMoviePicks(1, TIMEOUT);
    convo.media = movie;
  }
  return {
    data: `Download ${getDescription(convo.media)}?`,
  }
}
