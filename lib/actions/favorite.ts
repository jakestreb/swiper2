// import {getDescription, Video} from '../common/media';
// import {Conversation, Swiper, SwiperReply} from '../Swiper';

// export async function favorite(this: Swiper, convo: Conversation): Promise<SwiperReply> {
//   const video = convo.media as Video;
//   if (video.type !== 'movie') {
//     return {
//       data: 'Only movies can be added as favorites',
//       final: true
//     };
//   }
//   await this.dbManager.addToMoviePicks(video);
//   return {
//     data: `Favorited ${getDescription(video)}`,
//     final: true
//   };
// }
