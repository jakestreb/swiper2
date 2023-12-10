import * as dotenv from 'dotenv';
dotenv.config();

import * as sourceMapSupport from 'source-map-support';
sourceMapSupport.install();

import logger from './lib/util/logger';
import Swiper from './lib/Swiper';
import * as process from 'process'

Swiper.create()
.catch(err => {
  logger.error(`Process exiting on error: ${err}`);
  process.exit(1);
});
