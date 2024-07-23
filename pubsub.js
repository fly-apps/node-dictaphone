import { createClient } from 'redis';

var dataClient = createClient({ url: process.env.REDIS_URL });
var subClient = dataClient.duplicate();

var timestamp = new Date().toISOString();

export default {
  async connect(wss) {
    await dataClient.connect();

    dataClient.on('error', err => {
      console.error('Redis server error', err);
      process.exit(1);
    });

    timestamp = (await dataClient.get('dictaphone:timestamp').
      catch(err => null)) || timestamp;

    await subClient.connect();

    subClient.on('error', err => {
      console.error('Redis server error', err);
      process.exit(1);
    });

    subClient.subscribe('dictaphone:timestamp', message => {
      if (message) timestamp = message;

      for (const wsClient of wss.clients) {
        try { wsClient.send(timestamp) } catch {};
      }
    });
  },

  async publish(timestamp) {
    await dataClient.publish('dictaphone:timestamp', timestamp);
  },

  get timestamp() {
    return timestamp;
  }
}
