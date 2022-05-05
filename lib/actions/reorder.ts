// import {getDescription, Media} from '../common/media';
// import {execCapture, matchYesNo} from '../common/util';
// import Swiper from '../Swiper';

// export async function reorder(this: Swiper, convo: Conversation): Promise<SwiperReply> {
//   const mediaQuery = convo.mediaQuery as MediaQuery;

//   // In the case of reorder, we treat an unspecified episode list as all episodes.
//   if (!mediaQuery.episodes) {
//     mediaQuery.episodes = 'all';
//   }

//   // Add the position string.
//   if (!convo.position) {
//     const splitStr = (convo.input || '').split(' ');
//     const lastStr = splitStr.pop();
//     if (!lastStr) {
//       return { data: `Specify new position: \`first\` or \`last\`` };
//     }
//     const [first, last] = execCapture(lastStr, /(first)|(last)/);
//     if (!first && !last) {
//       return { data: `Specify new position: \`first\` or \`last\`` };
//     }
//     convo.position = first ? 'first' : 'last';
//     convo.input = splitStr.join(' ');
//   }

//   // Search the database for all matching Movies/Shows.
//   const reply = await this.addStoredMediaIfFound(convo);
//   if (reply) {
//     return reply;
//   }
//   const storedMedia: Media[]|null = convo.storedMedia || null;
//   if (!storedMedia) {
//     // No matches.
//     return { data: `Nothing matching ${convo.input} was found` };
//   }

//   // Ask the user about a media item if they are not all dealt with.
//   if (storedMedia.length > 0 && convo.input) {
//     const match = matchYesNo(convo.input);
//     if (match) {
//       // If yes or no, shift the task to 'complete' it, then remove it from the database.
//       const media: Media = storedMedia.shift()!;
//       if (match === 'yes') {
//         // Move media
//         if (media.type === 'movie') {
//           await this.dbManager.changeMovieQueuePos(media.id, convo.position);
//         } else if (media.type === 'tv') {
//           await this.dbManager.changeEpisodesQueuePos(media.episodes.map(e => e.id), convo.position);
//         }
//         // After moving, ping the download manager.
//         this.downloadManager.ping();
//       }
//     }
//   }
//   // Ask the user about a media item if they are still not all dealt with.
//   if (storedMedia.length > 0) {
//     // If the match failed or if there are still more storedMedia, ask about the next one.
//     return { data: getConfirmReorderString(storedMedia[0], convo.position) };
//   }

//   return {
//     data: `Ok`,
//     final: true
//   };
// }

// // Given either a Movie or Show and a position, create a string to confirm reorder with the user.
// function getConfirmReorderString(
//   media: Media,
//   pos: 'first'|'last'
// ): string {
//   const mediaStr = getDescription(media);
//   const newPosStr = pos === 'first' ? 'front' : 'end';
//   return `Move ${mediaStr} to the ${newPosStr} of the queue?`;
// }
