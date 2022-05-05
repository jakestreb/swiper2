// import {getDescription, Movie} from '../common/media';
// import {getPopularReleasedBetween} from '../common/request';
// import {getMorning, matchYesNo} from '../common/util';
// import {DBManager} from '../DBManager';
// import Swiper from '../Swiper';

// // Start suggesting 10 weeks back for proximity to dvd release
// const DVD_DELAY = 10 * 7 * 24 * 60 * 60 * 1000;
// const MONTH = 30 * 24 * 60 * 60 * 1000;

// export async function suggest(this: Swiper, convo: Conversation): Promise<SwiperReply> {
//   if (convo.media && convo.input) {
//     const match = matchYesNo(convo.input);
//     if (match) {
//       await this.dbManager.setSuggested(convo.media, convo.id);
//       if (match === 'yes') {
//         await this.dbManager.addToMonitored(convo.media, convo.id);
//       }
//     } else {
//       return { data: `Add ${getDescription(convo.media)} to monitored?` };
//     }
//   }
//   const movie = await getNextSuggestion(convo, this.dbManager);
//   if (movie) {
//     convo.media = movie;
//     return { data: `Add ${getDescription(movie)} to monitored?` };
//   }
//   return {
//     data: `Out of suggestions`,
//     final: true
//   };
// }

// // Affects conversation state
// async function getNextSuggestion(convo: Conversation, dbManager: DBManager): Promise<Movie|null> {
//   convo.storedMedia = convo.storedMedia || [];
//   convo.pageNum = convo.pageNum || 1;
//   while (convo.storedMedia!.length > 0 || convo.pageNum > -1) {
//     const next = await getNextFromStored(convo, dbManager);
//     if (next) {
//       return next;
//     }
//     await addFetchedPageToConvo(convo, dbManager);
//   }
//   return null;
// }

// // Affects conversation state
// async function getNextFromStored(convo: Conversation, dbManager: DBManager): Promise<Movie|null> {
//   const stored = convo.storedMedia || [];
//   while (stored.length > 0) {
//     const m = stored.pop() as Movie;
//     if (await isUnsuggested(dbManager, m)) {
//       return m;
//     }
//   }
//   return null;
// }

// // Affects conversation state
// async function addFetchedPageToConvo(convo: Conversation, dbManager: DBManager): Promise<void> {
//   const pageNum = convo.pageNum || 1;
//   if (pageNum > -1) {
//     const before = getMorning().getTime() - DVD_DELAY;
//     const result = await getPopularReleasedBetween(
//       new Date(before - (3 * MONTH)), new Date(before), pageNum);
//     convo.pageNum = result.page < result.total_pages ? pageNum + 1 : -1;
//     convo.storedMedia = result.movies;
//   }
// }

// async function isUnsuggested(dbManager: DBManager, movie: Movie): Promise<boolean> {
//   const videoMeta = await dbManager.addMetadata(movie);
//   return !videoMeta.isPredictive;
// }
