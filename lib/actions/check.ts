// import Swiper from '../Swiper';

// let checkInProgress: boolean = false;

// export async function check(this: Swiper, convo: Conversation): Promise<SwiperReply> {
//   if (checkInProgress) {
//     return { err: `Check is already in progress` };
//   }
//   checkInProgress = true;
//   setImmediate(async () => {
//     try {
//       await this.swiperMonitor.doCheck();
//     } finally {
//       checkInProgress = false;
//     }
//   });
//   return {
//     data: `Checking for monitored content`,
//     final: true
//   };
// }
