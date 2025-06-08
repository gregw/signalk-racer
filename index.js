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

    // Update meta data
    const timestamp = new Date().toISOString();
    app.handleMessage('vessels.self', {
        context: "vessels.self",
        updates: [
            {
                timestamp: timestamp,
                "meta": [
                    {
                        "path": "racing.distanceStartline",
                        "value": {
                            "units": "m",
                            "description": "Minimum distance to the start line",
                            "displayName": "Distance to start line",
                            "shortName": "DTL",
                            "zones": []
                        }
                    },
                    {
                        "path": "racing.startLineLength",
                        "value": {
                            "units": "m",
                            "description": "Length of the start line",
                            "displayName": "Length of the start line",
                            "shortName": "SLL",
                            "zones": []
                        }
                    },
                    {
                        "path": "racing.startLinePort.latitude",
                        "value": {
                            "units": "deg",
                            "description": "Latitude of the port end of the start line",
                            "displayName": "Port start end latitude",
                            "shortName": "startPortLat",
                        }
                    },
                    {
                        "path": "racing.startLinePort.longitude",
                        "value": {
                            "units": "deg",
                            "description": "Longitude of the port end of the start line",
                            "displayName": "Port start end Longitude",
                            "shortName": "startPortLong",
                        }
                    },
                    {
                        "path": "racing.startLineStb.latitude",
                        "value": {
                            "units": "deg",
                            "description": "Latitude of the starboard end of the start line",
                            "displayName": "Starboard start end latitude",
                            "shortName": "startStbLat",
                        }
                    },
                    {
                        "path": "racing.startLineStb.longitude",
                        "value": {
                            "units": "deg",
                            "description": "Longitude of the starboard end of the start line",
                            "displayName": "Starboard start end Longitude",
                            "shortName": "startStbLong",
                        }
                    }
                ]
            }
        ]
    });


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

            function toDegrees(rad) {
                return rad * (180 / Math.PI);
            }

            function bowPosition(position) {
                if (position)
                    return position; // TODO test the code below

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

            function findLineAndThenProcessPosition(position, alwaysFindLine = false) {
                if (!state.startLine || alwaysFindLine) {
                    app.resourcesApi.listResources(
                        'waypoints',
                        {}
                    ).then(data => {
                        state.wayPointsScanned = true;
                        
                        const startLine = {
                            stb: undefined,
                            port: undefined,
                            length: undefined,
                            bearing: undefined,
                        }
                        for (const [key, value] of Object.entries(data)) {
                            app.debug(`WAYPOINT: ${key}, Value:`, JSON.stringify(value));
                            if (value.name === options.startLinePort) {
                                let pos = waypointToPosition(value);
                                if (pos)
                                    startLine.port = pos;
                            }
                            if (value.name === options.startLineStb) {
                                let pos = waypointToPosition(value);
                                if (pos)
                                    startLine.stb = pos;
                            }
                        }
                        if (startLine.port && startLine.stb) {
                            startLine.length = geolib.getPreciseDistance(startLine.port, startLine.stb, 0.1);
                            startLine.bearing = geolib.getRhumbLineBearing(startLine.stb, startLine.port);

                            app.debug(`STARTLINE: startLinePort: ${JSON.stringify(startLine)}`);
                            state.startLine = startLine;
                        } else {
                            app.debug(`STARTLINE: undefined`);
                            state.startLine = undefined;
                        }

                        sendDeltas([
                            { path: 'racing.startLinePort', value: startLine.port },
                            { path: 'racing.startLineStb', value: startLine.stb },
                            { path: 'racing.startLineLength', value: startLine.length },
                        ]);

                        processPosition(position);

                    }).catch(err => {
                        app.error(err);
                    });
                } else {
                    processPosition(position);
                }
            }

            function processPosition(position) {
                if (!position) {
                    position = app.getSelfPath('navigation.position');
                    app.debug('POSITION:' + JSON.stringify(position));
                    position = position ? position.value : null;
                }

                const startLine = state.startLine;

                app.debug(`processPosition ${JSON.stringify(position)} to ${JSON.stringify(startLine)}`);
                if (position && startLine ) {
                    // handle the bow offset
                    const bow= bowPosition(position);

                    // Get the distance to each end of the line
                    const toPort = geolib.getPreciseDistance(bow, startLine.port,  0.1);
                    const toStb = geolib.getPreciseDistance(bow, startLine.stb, 0.1);

                    const closest = toPort < toStb ? startLine.port : startLine.stb;
                    let toEnd;
                    let ocs;
                    let angle;
                    if (closest === state.startLine.port) {
                        toEnd = toPort;
                        app.debug('closest to Port(pin):' + toPort);
                        const toBowBearing = geolib.getRhumbLineBearing(startLine.port, bow);
                        app.debug('toBowBearing:' + toBowBearing);
                        angle = toBowBearing - (startLine.bearing + 180) % 360;
                    } else {
                        toEnd = toStb;
                        app.debug('closest to Stb(boat):' + toStb);
                        const toBowBearing = geolib.getRhumbLineBearing(startLine.stb, bow);
                        app.debug('toBowBearing:' + toBowBearing);
                        angle = startLine.bearing - toBowBearing;
                    }
                    app.debug('angle:' + angle);
                    angle = ((angle + 180) % 360 + 360) % 360 - 180;
                    app.debug('angle:' + angle);
                    ocs = angle < 0;
                    app.debug('ocs:' + ocs);

                    let absAngle = Math.abs(angle);
                    const farFromLine = absAngle > 135;
                    app.debug('farFromLine:' + farFromLine);
                    const perpendicularToLine = Math.sin(absAngle * Math.PI / 180) * toEnd;
                    app.debug('perpendicularToLine:' + perpendicularToLine);
                    const toLine = Math.round(10 * farFromLine ? Math.sqrt(toEnd * toEnd - perpendicularToLine * perpendicularToLine) : perpendicularToLine) / 10;
                    const distanceToLine = ocs ? - toLine : toLine;
                    app.debug('distanceToLine:' + distanceToLine);
                    sendDeltas([
                        { path: 'racing.distanceStartline', value: distanceToLine },
                    ]);
                }
            }

            // Subscribe to position updates.
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
                    app.debug('DELTA POSITIONS ' + JSON.stringify(delta));
                    position = null;
                    delta.updates.forEach((u) => {
                        u.values.forEach((v) =>
                        {
                            app.debug('DELTA POSITION ' + v.path + ' = ' + JSON.stringify(v.value));
                            position = v.value;
                        })
                    })

                    if (state.startLine)
                        processPosition(position);
                    else
                        findLineAndThenProcessPosition(position, false);
                }
            )

            // Subscribe to waypoint updates.
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
                    app.debug('DELTA WAYPOINTS ' + JSON.stringify(delta));
                    delta.updates.forEach((u) => {
                        u.values.forEach((v) => {
                            app.debug("DELTA WAYPOINT: " + v.path + ' = ' + JSON.stringify(v.value))
                        })
                    });
                    state.wayPointsScanned = false;
                    findLineAndThenProcessPosition(undefined, true);
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

