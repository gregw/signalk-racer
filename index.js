module.exports = (app) => {

  const racerSchema = require('./schema.json');

  const plugin = {
    id: 'signalk-racer',
    name: 'SignalK Racing Plugin',
    start: (settings, restartPlugin) => {
      // start up code goes here.
    },
    stop: () => {
      // shutdown code goes here.
    },
    schema: () => racerSchema
  };

  return plugin;
};

