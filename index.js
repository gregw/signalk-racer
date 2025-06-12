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
            /* TODO
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
             */
        }
    }

    // Update meta data for non standard paths
    const timestamp = new Date().toISOString();
    app.handleMessage('vessels.self', {
        context: "vessels.self",
        updates: [
            {
                timestamp: timestamp,
                "meta": [
                    {
                        "path": "navigation.racing.startLineLength",
                        "value": {
                            "units": "m",
                            "description": "Length of the start line",
                            "displayName": "Length of the start line",
                            "shortName": "SLL"
                        }
                    },
                    {
                        "path": "navigation.racing.stbLineBias",
                        "value": {
                            "units": "m",
                            "description": "Bias of the start line for the starboard end",
                            "displayName": "Bias of the start line for the starboard end",
                            "shortName": "SLB"
                        }
                    },
                    {
                        "path": "navigation.racing.nextLegHeading",
                        "value": {
                            "units": "rad",
                            "description": "Heading of the next leg of the course",
                            "displayName": "Heading of the next leg of the course",
                            "shortName": "NHDG",
                        }
                    },
                    {
                        "path": "navigation.racing.nextLegTrueWindAngle",
                        "value": {
                            "units": "rad",
                            "description": "TWA on the next leg of the course",
                            "displayName": "TWA on the next leg of the course",
                            "shortName": "NTWA",
                        }
                    },
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
                            source: {label: 'signalk-racer'},
                            timestamp: timestamp,
                            values: updatesArray.map(({path, value}) => ({
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
                    return {latitude, longitude};
                } else {
                    return null;
                }
            }

            function toDegrees(rad) {
                return rad ? rad * (180 / Math.PI) : null;
            }

            function toRadians(degrees) {
                return degrees ? degrees * (Math.PI / 180) : null;
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

                let bow = position;
                if (state.gpsFromBow)
                    bow = geolib.computeDestinationPoint(bow, state.gpsFromBow, headingTrue);
                if (state.gpsFromCenter)
                    bow = geolib.computeDestinationPoint(bow, state.gpsFromCenter, headingTrue + 90);
                app.debug('bowPosition:' + JSON.stringify(bow));
                return bow;
            }

            plugin.setStartLineEnd = async (req, res) => {
                try {
                    const end = req.params.end;  // "port" or "stb"
                    if (end !== 'port' && end !== 'stb') {
                        res.status(400).send({error: 'End must be "port" or "stb"'});
                        return;
                    }

                    let position = app.getSelfPath('navigation.position');
                    if (position)
                        position = position.value;
                    else {
                        res.status(500).send({error: 'No valid position available'});
                        return;
                    }
                    const bow = bowPosition(position);
                    const startLine = state.startLine;
                    const waypointName = options[`startLine${end.charAt(0).toUpperCase() + end.slice(1)}`];

                    let waypointId = startLine ? startLine[end + 'Id'] : null;
                    if (!waypointId) {
                        // Get the ID of the last existing waypoint with the given name.
                        const waypoints = await app.resourcesApi.listResources('waypoints', {});
                        for (const [id, resource] of Object.entries(waypoints)) {
                            if (resource.name === waypointName) {
                                waypointId = id;
                                // don't break here as we want the last waypoint with the given name
                            }
                        }
                    }

                    app.debug(`POSITION to set ${end}(${waypointName}/${waypointId}): ${JSON.stringify(bow)}`);

                    const waypoint = {
                        name: waypointName,
                        feature: {
                            type: 'Feature',
                            geometry: {
                                type: 'Point',
                                coordinates: [bow.longitude, bow.latitude]
                            },
                            properties: {}
                        }
                    }

                    app.debug(`waypoint: ${waypointId} -> ${end}/${waypointName} : ${JSON.stringify(waypoint)}`);

                    if (waypointId)
                        await app.resourcesApi.setResource('waypoints', waypointId, waypoint);
                    else
                        await app.resourcesApi.createResource('waypoints', waypoint);

                    res.json({
                        message: 'OK'
                    });

                    if (startLine)
                    {
                        const newStartLine = { ...state.startLine };
                        newStartLine[end + 'Id'] = waypointId;
                        newStartLine[end] = bow;
                        startLine.length = geolib.getPreciseDistance(newStartLine.port, newStartLine.stb, 0.1);
                        startLine.bearing = geolib.getRhumbLineBearing(newStartLine.stb, newStartLine.port);
                        state.startLine = newStartLine;
                        sendDeltas([
                            { path: `navigation.racing.startLine${end.charAt(0).toUpperCase() + end.slice(1)}`, value: bow },
                            { path: 'navigation.racing.startLineLength', value: newStartLine.length },
                        ]);

                        processPosition(position);
                    } else {
                        findLineAndThenProcess(position, true);
                    }
                } catch (err) {
                    app.error('Failed to set start line end:', err);
                    res.status(500).json({ error: 'Failed to set start line end' });
                }
            }

            function findLineAndThenProcess(position, alwaysFindLine = false) {
                if (!state.startLine || alwaysFindLine) {
                    app.resourcesApi.listResources(
                        'waypoints',
                        {}
                    ).then(data => {
                        state.wayPointsScanned = true;

                        const startLine = {
                            stb: null,
                            port: null,
                            length: null,
                            bearing: null,
                        }
                        for (const [key, value] of Object.entries(data)) {
                            app.debug(`WAYPOINT: ${key}, Value:`, JSON.stringify(value));
                            if (value.name === options.startLinePort) {
                                let pos = waypointToPosition(value);
                                if (pos) {
                                    startLine.portId = key;
                                    startLine.port = pos;
                                }
                            }
                            if (value.name === options.startLineStb) {
                                let pos = waypointToPosition(value);
                                if (pos) {
                                    startLine.stbId = key;
                                    startLine.stb = pos;
                                }
                            }
                        }

                        if (startLine.port && startLine.stb) {
                            startLine.length = geolib.getPreciseDistance(startLine.port, startLine.stb, 0.1);
                            startLine.bearing = geolib.getRhumbLineBearing(startLine.stb, startLine.port);

                            app.debug(`STARTLINE: startLinePort: ${JSON.stringify(startLine)}`);
                            state.startLine = startLine;
                        } else {
                            app.debug(`STARTLINE: undefined`);
                            state.startLine = null;
                        }

                        sendDeltas([
                            {path: 'navigation.racing.startLinePort', value: startLine.port},
                            {path: 'navigation.racing.startLineStb', value: startLine.stb},
                            {path: 'navigation.racing.startLineLength', value: startLine.length},
                        ]);

                        processPosition(position);
                        processWind()

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
                if (position && startLine && (!state.activeRoute || state.activeRoute.pointIndex < 2)) {
                    // handle the bow offset
                    const bow = bowPosition(position);

                    // Get the distance to each end of the line
                    const toPort = geolib.getPreciseDistance(bow, startLine.port, 0.1);
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
                    angle = ((angle + 180) % 360 + 360) % 360 - 180;
                    app.debug('angle:' + angle);
                    app.debug('toEnd:' + toEnd);
                    ocs = angle < 0;
                    app.debug('ocs:' + ocs);

                    let absAngle = Math.abs(angle);
                    const farFromLine = absAngle > 135;
                    app.debug('farFromLine:' + farFromLine);
                    const perpendicularToLine = toEnd * Math.sin(toRadians(absAngle));
                    app.debug('perpendicularToLine:' + perpendicularToLine);
                    let toLine = farFromLine ? Math.sqrt(toEnd * toEnd - perpendicularToLine * perpendicularToLine) : perpendicularToLine;
                    toLine = Math.round(10 * toLine) / 10;
                    app.debug('toLine:' + toLine);
                    const distanceToLine = ocs ? -toLine : toLine;
                    app.debug('distanceToLine:' + distanceToLine);
                    state.distanceToLine = distanceToLine;
                    sendDeltas([
                        {path: 'navigation.racing.distanceStartline', value: distanceToLine},
                    ]);
                }
                else if (state.distanceToLine) {
                    state.distanceToLine = null;
                    sendDeltas([
                        {path: 'navigation.racing.distanceStartline', value: null},
                    ]);
                }
            }

            function processWind(twd) {
                if (!twd) {
                    twd = app.getSelfPath('environment.wind.directionTrue');
                    app.debug('TWD:' + JSON.stringify(twd));
                    twd = twd ? twd.value : null;
                }

                if (!twd)
                    return;

                let nextTwa = null;
                const activeRoute = state.activeRoute;
                if (activeRoute) {
                    const nextLegHeading = activeRoute.nextLegHeading;
                    if (nextLegHeading) {
                        nextTwa = (540 + toDegrees(twd) - nextLegHeading) % 360 - 180;
                        app.debug(`nextTwa: ${nextTwa}`);
                    }
                }

                let bias = null;
                const startLine = state.startLine;
                if (startLine && (!activeRoute || activeRoute.pointIndex < 2)) {
                    app.debug(`processWind ${twd} to ${JSON.stringify(startLine)}`);
                    bias = startLine.length * Math.cos(toRadians(startLine.bearing) - (twd + Math.PI));
                }

                sendDeltas([
                    {path: 'navigation.racing.stbLineBias', value: bias},
                    {path: 'navigation.racing.nextLegTrueWindAngle', value: toRadians(nextTwa)},
                ]);
            }

            function processRoute(activeRoute) {
                if (activeRoute && (activeRoute.pointIndex + 1) < activeRoute.pointTotal) {
                    // e.g. {"href":"/resources/routes/a12eefe7-8fd3-49f7-81af-ce1f3440d3ff","name":"Course 1","reverse":false,"pointIndex":1,"pointTotal":5}
                    const routeId = activeRoute.href.split('/').pop(); //  e.g. "a12eefe7-8fd3-49f7-81af-ce1f3440d3ff"
                    app.debug('processRoute:' + routeId);
                    app.resourcesApi.getResource('routes', routeId).then(route => {
                        app.debug('found active route:', JSON.stringify(route));
                        // e.g. {name:"Course 1",description:"Test race course",distance:3027,feature:{type:"Feature",geometry:{type:"LineString",coordinates:[[151.2789194160523,-33.80427227074185],[151.28230238234357,-33.813458268981435],[151.2758044350174,-33.80201284252691],[151.27864400784992,-33.801915364141514],[151.27982384226053,-33.80429179893497]]},properties:{coordinatesMeta:[{href:"/resources/waypoints/bb35d9d0-c04e-4721-89f2-a1d8e697ab81"},{href:"/resources/waypoints/65082ddd-6fa6-4538-9a01-49d5d795b0bb"},{href:"/resources/waypoints/0bbce508-67c6-4f03-8de0-fb0532f88917"},{href:"/resources/waypoints/602ee562-c6dc-42c3-a775-512597063ca4"},{href:"/resources/waypoints/2e3cf194-8835-498d-abaa-a5d2104550b3"}]},id:""},timestamp:"2025-06-09T22:22:54.739Z",$source:"resources-provider"}
                        const coordinates = route.feature.geometry.coordinates;
                        const [fromLongitude, fromLatitude] = coordinates[activeRoute.pointIndex];
                        const [toLongitude, toLatitude] = coordinates[activeRoute.pointIndex + 1];
                        app.debug(`from: {longitude:${fromLongitude}, latitude:${fromLatitude}}, to: {longitude:${toLongitude}, latitude:${toLatitude}}`);
                        const nextLegHeading = geolib.getRhumbLineBearing({
                            latitude: fromLatitude,
                            longitude: fromLongitude
                        }, {latitude: toLatitude, longitude: toLongitude});
                        app.debug(`nextLegHeading: ${nextLegHeading}`);

                        activeRoute.nextLegHeading = nextLegHeading;
                        state.activeRoute = activeRoute;
                        sendDeltas([
                            {path: 'navigation.racing.nextLegHeading', value: toRadians(nextLegHeading)}
                        ]);
                    }).catch(err => {
                        app.error(err);
                    });
                } else {
                    state.activeRoute = null;
                    sendDeltas([
                        {path: 'navigation.racing.nextLegHeading', value: null}
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
                        u.values.forEach((v) => {
                            app.debug('DELTA POSITION ' + v.path + ' = ' + JSON.stringify(v.value));
                            position = v.value;
                        })
                    })

                    if (state.startLine)
                        processPosition(position);
                    else
                        findLineAndThenProcess(position, false);

                    if (!state.initActiveRoute) {
                        state.initActiveRoute = true;
                        const activeRoute = app.getSelfPath('navigation.course.activeRoute');
                        if (activeRoute)
                            processRoute(activeRoute.value);
                    }
                }
            )

            // Subscribe to waypoint updates.
            app.subscriptionmanager.subscribe(
                {
                    context: 'vessels.' + app.selfId,
                    subscribe: [
                        {
                            path: 'resources.waypoints.*',
                            policy: 'instant'
                        }
                    ]
                },
                unsubscribes,
                (subscriptionError) => {
                    app.error('Error:' + subscriptionError)
                },
                (delta) => {
                    app.debug('DELTAS WAYPOINTS ' + JSON.stringify(delta));
                    delta.updates.forEach((u) => {
                        u.values.forEach((v) => {
                            app.debug("DELTA WAYPOINT: " + v.path + ' = ' + JSON.stringify(v.value))
                        })
                    });
                    state.wayPointsScanned = false;
                    findLineAndThenProcess(undefined, true);
                }
            )

            // Subscribe to TWD updates.
            app.subscriptionmanager.subscribe(
                {
                    context: 'vessels.' + app.selfId,
                    subscribe: [
                        {
                            path: 'environment.wind.directionTrue',
                            period: options.period,
                        }
                    ]
                },
                unsubscribes,
                (subscriptionError) => {
                    app.error('Error:' + subscriptionError)
                },
                (delta) => {
                    let twd;
                    app.debug('DELTAS TWD ' + JSON.stringify(delta));
                    delta.updates.forEach((u) => {
                        u.values.forEach((v) => {
                            twd = v.value;
                            app.debug("DELTA TWD: " + v.path + ' = ' + twd)
                        })
                    });
                    processWind(twd);
                }
            )

            // Subscribe to Active route.
            app.subscriptionmanager.subscribe(
                {
                    context: 'vessels.' + app.selfId,
                    subscribe: [
                        {
                            path: 'navigation.course.activeRoute',
                            policy: 'instant'
                        }
                    ]
                },
                unsubscribes,
                (subscriptionError) => {
                    app.error('Error:' + subscriptionError)
                },
                (delta) => {
                    let route;
                    app.debug('DELTAS ACTIVE ROUTE ' + JSON.stringify(delta));
                    delta.updates.forEach((u) => {
                        u.values.forEach((v) => {
                            route = v.value;
                            app.debug("DELTA ACTIVE ROUTE: " + v.path + ' = ' + JSON.stringify(route));
                        })
                    });
                    if (route)
                        processRoute(route);
                }
            )
        },

        stop: () => {
            unsubscribes.forEach((f) => f());
            unsubscribes.length = 0;
        },

        schema: () => racerSchema,

        registerWithRouter: (router) => {
            router.get('/startline/port', (req, res) => res.json(state.startLine ? state.startLine.port : null));
            router.get('/startline/stb', (req, res) => res.json(state.startLine ? state.startLine.stb : null));
            router.put('/startline/:end', plugin.setStartLineEnd);
        },

        getOpenApi: () => require('./openapi.json'),
    };

    return plugin;
};

