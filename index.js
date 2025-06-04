module.exports = (app) => {

    const racerSchema = {
        title: 'Set System Time with sudo',
        type: 'object',
        properties: {
            lineStarboard: {
                type: 'string',
                title: 'Line starboard waypoint name',
                default: 'boat'
            },
            linePort: {
                type: 'string',
                title: 'Line port waypoint name',
                default: 'pin'
            },
            speedToLine: {
                type: 'number',
                title: 'The percentage of the best STW seen during the start period to use when calculating the time to the start line. This assumes the boat can sail slower than its best speed at most wind angles. Or -1 to use the current STW',
                default: 80
            },
            twaUpToLine: {
                type: 'number',
                title: 'The upwind TWA to use when calculating the time to the line, or -1 to use the best achieved during the start period',
                default: 45
            },
            twaDownToLine: {
                type: 'number',
                title: 'The downwind TWA to use when calculating the time to the line, or -1 to use the best achieved during the start period',
                default: 155
            },
        }
    }

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

