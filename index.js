module.exports = (app) => {
    const geolib = require('geolib')
    const racerSchema = {
        title: 'Set System Time with sudo',
        type: 'object',
        properties: {
            startLineStb: {
                type: 'string',
                title: 'Line starboard waypoint name',
                default: 'startBoat'
            },
            startLinePort: {
                type: 'string',
                title: 'Line port waypoint name',
                default: 'startPin'
            },
            period: {
                type: 'number',
                title: 'Update period in micro seconds',
                default: 1000
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

    let unsubscribes = []

    const plugin = {
        id: 'signalk-racer',
        name: 'SignalK Racing Plugin',
        start: (options, restartPlugin) => {
            if (!options.startLinePort || !options.startLineStb) {
                app.error('Missing waypoint names: startLinePort and/or startLineStb not configured.');
                return;
            }
            app.debug('startLinePort:' + options.startLinePort);
            app.debug('startLineStb:' + options.startLineStb);
            app.debug('app.selfId:' + app.selfId);

            let state = {
                wayPointsScanned: false,
                gpsFromBow: app.getSelfPath('sensors.gps.fromBow')
            }

            function sendDelta(path, value) {
                const delta = {
                    context: 'vessels.self',
                    updates: [
                        {
                            source: { label: 'signalk-racer' },
                            timestamp: new Date().toISOString(),
                            values: [
                                {
                                    path: path,
                                    value: value
                                }
                            ]
                        }
                    ]
                }
                app.handleMessage('vessels.self', delta)
            }

            function waypointToPosition(waypoint) {
                if (
                    waypoint &&
                    waypoint.feature &&
                    waypoint.feature.geometry &&
                    waypoint.feature.geometry.type === 'Point' &&
                    Array.isArray(waypoint.feature.geometry.coordinates) &&
                    waypoint.feature.geometry.coordinates.length === 2
                ) {
                    const [longitude, latitude] = waypoint.feature.geometry.coordinates;
                    return { latitude, longitude };
                } else {
                    return null;
                }
            }

            function scanWaypoints() {
                if (!state.wayPointsScanned) {
                    app.resourcesApi.listResources(
                        'waypoints',
                        {}
                    ).then(data => {
                        state.wayPointsScanned = true;
                        state.startLinePort = null;
                        state.startLineStb = null;
                        app.debug(JSON.stringify(data));
                        for (const [key, value] of Object.entries(data)) {
                            app.debug(`Key: ${key}, Value:`, JSON.stringify(value));

                            if (value.name === options.startLinePort) {
                                pos = waypointToPosition(value);
                                if (pos) {
                                    app.debug('startLinePort.position:' + JSON.stringify(pos));
                                    state.startLinePort = pos;
                                }
                            }
                            if (value.name === options.startLineStb) {
                                pos = waypointToPosition(value);
                                app.debug('startLineStb.position:' + JSON.stringify(pos));
                                state.startLineStb = pos;
                            }
                        }

                        sendDelta('racing.startLinePort', state.startLinePort);
                        sendDelta('racing.startLineStb', state.startLineStb);

                    }).catch(err => {
                        app.error(err);
                    });
                }
            }

            function calculateLine(position) {
                if (position && state.startLinePort && state.startLineStb) {
                    startLineLength = geolib.getDistance(state.startLinePort, state.startLineStb);
                    app.debug('startLineLength:' + startLineLength);
                    sendDelta('racing.startLineLength', startLineLength);
                }
            }
            
            let positionSubscription = {
                context: 'vessels.' + app.selfId,
                subscribe: [
                    {
                        path: 'navigation.position',
                        period: options.period,
                    }
                ]
            }

            app.subscriptionmanager.subscribe(
                positionSubscription,
                unsubscribes,
                (subscriptionError) => {
                    app.error('Error:' + subscriptionError)
                },

                (delta) => {
                    position = null;
                    delta.updates.forEach((u) => {
                        u.values.forEach((v) =>
                        {
                            app.debug('POSITION ' + v.path + ' = ' + JSON.stringify(v.value));
                            position = v.value;
                        })
                    })
                    scanWaypoints();
                    calculateLine(position);
                }
            )

            let waypointSubscription = {
                context: 'vessels.' + app.selfId,
                subscribe: [
                    {
                        path: 'resources.waypoints.*', // Get all paths
                        policy: 'instant'
                    }
                ]
            }

            app.subscriptionmanager.subscribe(
                waypointSubscription,
                unsubscribes,
                (subscriptionError) => {
                    app.error('Error:' + subscriptionError)
                },
                (delta) => {
                    delta.updates.forEach((u) => {
                        u.values.forEach((v) => {
                            app.debug("WAYPOINT: " + v.path + ' = ' + JSON.stringify(v.value))
                        })
                    });
                    state.wayPointsScanned = false;
                    scanWaypoints();
                }
            )
        },

        stop: () => {
            unsubscribes.forEach((f) => f())
            unsubscribes = []
        },

        schema: () => racerSchema
    };

    return plugin;
};

