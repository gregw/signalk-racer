module.exports = (app) => {

    const racerSchema = {
        title: 'Set System Time with sudo',
        type: 'object',
        properties: {
            lineStarboard: {
                type: 'string',
                title: 'Line starboard waypoint name',
                default: 'startBoat'
            },
            linePort: {
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
            if (!options.linePort || !options.lineStarboard) {
                app.error('Missing waypoint names: linePort and/or lineStarboard not configured.');
                return;
            }
            app.debug('linePort:' + options.linePort);
            app.debug('lineStarboard:' + options.lineStarboard);
            app.debug('app.selfId:' + app.selfId);
            app.debug('getSelfPath(design)' + JSON.stringify(app.getSelfPath('design')));

            let state = {
                wayPointsScanned: false
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
                        app.debug(JSON.stringify(data));
                        for (const [key, value] of Object.entries(data)) {
                            app.debug(`Key: ${key}, Value:`, JSON.stringify(value));

                            if (value.name === options.linePort) {
                                pos = waypointToPosition(value);
                                if (pos) {
                                    app.debug('linePort.position:' + pos);
                                    state.linePort = pos;
                                    sendDelta('racing.startLinePort', pos);
                                }
                            }
                            if (value.name === options.lineStarboard) {
                                pos = waypointToPosition(value);
                                app.debug('lineStarboard.position:' + pos);
                                state.lineStarboard = pos;
                                sendDelta('racing.startLineStb', pos);
                            }
                        }
                    }).catch(err => {
                        app.error(err);
                    });
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
                    delta.updates.forEach((u) => {
                        app.debug(JSON.stringify(u));
                        u.values.forEach((v) =>
                        {
                            app.debug('POSITION ' + v.path + ' = ' + JSON.stringify(v.value))
                            scanWaypoints();
                        })
                    })
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
                        app.debug(JSON.stringify(u));
                        u.values.forEach((v) =>
                        {
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

