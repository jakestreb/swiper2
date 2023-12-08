import * as dotenv from 'dotenv';
dotenv.config();

import * as log from './lib/util/log';
import Swiper from './lib/Swiper';
import * as process from 'process'

// import * as heapProfile from 'heap-profile';

// Uncomment to enable heap profiling
// heapProfile.start();
// setInterval(() => {
//   Write a snapshot to disk every 6 hours
//   heapProfile.write((err, filename) => {
//     console.log(`heapProfile.write. err: ${err} filename: ${filename}`);
//   });
// }, 6 * 60 * 60 * 1000).unref();

Swiper.create()
.catch(err => {
  log.error(`Process exiting on error: ${err}`);
  process.exit(1);
});
