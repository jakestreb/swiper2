import 'dotenv/config.js';

import * as sourceMapSupport from 'source-map-support';
sourceMapSupport.install();

import logger from './lib/util/logger.js';
import Swiper from './lib/Swiper.js';

Swiper.create()
.catch(err => {
  logger.error(`Process exiting on error: ${err}`);
  process.exit(1);
});
