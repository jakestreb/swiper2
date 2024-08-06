import Swiper from '../Swiper.js';
import axios from 'axios';

export async function ip(this: Swiper, convo: Conversation): Promise<SwiperReply> {
  const response = await axios.get('https://api.ipify.org?format=json');
  return {
    data: response.data.ip,
    final: true
  };
}
