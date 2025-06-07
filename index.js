const geolib = require("geolib");
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

    const unsubscribes = [];

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

            let fromBow = app.getSelfPath('sensors.gps.fromBow');
            let fromCenter = app.getSelfPath('sensors.gps.fromCenter');
            const state = {
                wayPointsScanned: false,
                gpsFromBow: fromBow ? fromBow.value : null,
                gpsFromCenter: fromCenter ? fromCenter.value : null,
            }

            // send multiple deltas, each in the form of { path, value, units?}
            function sendDeltas(updatesArray) {
                const timestamp = new Date().toISOString();

                const delta = {
                    context: 'vessels.self',
                    updates: [
                        {
                            source: { label: 'signalk-racer' },
                            timestamp: timestamp,
                            values: updatesArray.map(({ path, value }) => ({
                                path,
                                value
                            }))
                        }
                    ]
                };

                app.debug('Sending deltas:', JSON.stringify(delta));
                app.handleMessage('vessels.self', delta);
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
                                let pos = waypointToPosition(value);
                                if (pos) {
                                    app.debug('startLinePort.position:' + JSON.stringify(pos));
                                    state.startLinePort = pos;
                                }
                            }
                            if (value.name === options.startLineStb) {
                                let pos = waypointToPosition(value);
                                app.debug('startLineStb.position:' + JSON.stringify(pos));
                                state.startLineStb = pos;
                            }
                        }
                        app.debug(
                            `startLinePort: ${JSON.stringify(state.startLinePort)}, startLineStb: ${JSON.stringify(state.startLineStb)}`
                        )
                        sendDeltas([
                            { path: 'racing.startLinePort', value: state.startLinePort },
                            { path: 'racing.startLineStb', value: state.startLineStb },
                        ]);
                    }).catch(err => {
                        app.error(err);
                    });
                }
            }

            function toDegrees(rad) {
                return rad * (180 / Math.PI);
            }

            function bowPosition(position) {
                let headingTrue = app.getSelfPath("navigation.headingTrue");
                if (!headingTrue)
                    headingTrue = app.getSelfPath("navigation.courseOverGroundTrue");
                if (!headingTrue || (!state.gpsFromBow && !state.gpsFromCenter))
                    return position

                headingTrue = toDegrees(headingTrue.value);
                app.debug('headingTrue:' + headingTrue);
                app.debug('position:' + JSON.stringify(position));
                app.debug('gpsFromBow:' + JSON.stringify(state.gpsFromBow));
                app.debug('gpsFromCenter:' + JSON.stringify(state.gpsFromCenter));

                if (state.gpsFromBow)
                    position = geolib.computeDestinationPoint(position, state.gpsFromBow, headingTrue);

                app.debug('bowPosition:' + JSON.stringify(position));

                if (state.gpsFromCenter)
                    position = geolib.computeDestinationPoint(position, state.gpsFromCenter, headingTrue + 90);

                app.debug('bowPosition:' + JSON.stringify(position));
                return position;
            }

            function calculateLine(position) {
                if (position && state.startLinePort && state.startLineStb) {
                    const startLineLength = geolib.getDistance(state.startLinePort, state.startLineStb);
                    app.debug('startLineLength:' + startLineLength);

                    // get the perpendicular distance from the line to the position
                    const perpendicularDTL = geolib.getDistanceFromLine(position, state.startLinePort, state.startLineStb);

                    // if the boat is inside a 45degree zone from the ends of the line, then use the distance to the closest
                    // end of the line instead of the perpendicular distance
                    const distanceToPort = geolib.getDistance(position, state.startLinePort);
                    const distanceToStb = geolib.getDistance(position, state.startLineStb);
                    let distanceToLine = perpendicularDTL;
                    const diagonal45 = Math.sqrt(2 * perpendicularDTL * perpendicularDTL);
                    if (distanceToPort > startLineLength && distanceToStb > diagonal45)
                        distanceToLine = distanceToStb;
                    else if (distanceToStb > startLineLength && distanceToPort > diagonal45)
                        distanceToLine = distanceToPort;
                    distanceToLine = Math.round(distanceToLine * 10) / 10;
                    app.debug('distanceToLine:' + distanceToLine);

                    // work out which side of the line we are on
                    const lineBearing = geolib.getRhumbLineBearing(state.startLinePort, state.startLineStb);
                    const bowBearing = geolib.getRhumbLineBearing(state.startLinePort, position);
                    const angleDiff = ((bowBearing - lineBearing + 540) % 360) - 180;
                    const signedDTL = angleDiff > 0 ? distanceToLine : -distanceToPort;
                    app.debug('racing.distanceStartline:' + signedDTL);

                    // send the deltas
                    sendDeltas([
                        { path: 'racing.startLineLength', value: startLineLength },
                        { path: 'racing.distanceStartline', value: signedDTL },
                    ]);
                }
            }

            app.subscriptionmanager.subscribe(
                {
                    context: 'vessels.' + app.selfId,
                    subscribe: [
                        {
                            path: 'navigation.position',
                            period: options.period,
                        }
                    ]
                },
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
                    calculateLine(bowPosition(position));
                }
            )

            app.subscriptionmanager.subscribe(
                {
                    context: 'vessels.' + app.selfId,
                    subscribe: [
                        {
                            path: 'resources.waypoints.*', // Get all paths
                            policy: 'instant'
                        }
                    ]
                },
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
            unsubscribes.forEach((f) => f());
            unsubscribes.length = 0;
        },

        schema: () => racerSchema
    };

    return plugin;
};

