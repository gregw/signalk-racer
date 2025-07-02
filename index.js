module.exports = (app) => {
    const state = {};
    const geolib = require('geolib')
    const racerSchema = {
        title: 'Signalk Racer Configuration',
        type: 'object',
        properties: {
            startLineStb: {
                type: 'string',
                title: 'The start line starboard end (boat) waypoint name',
                default: 'startBoat'
            },
            startLinePort: {
                type: 'string',
                title: 'The start line port end (pin) waypoint name',
                default: 'startPin'
            },
            updateStartLineWaypoint: {
                type: 'boolean',
                title: 'Update the start line waypoints if the startLine is updated',
                default: 'true'
            },
            createStartLineWaypoint: {
                type: 'boolean',
                title: 'Create the start line waypoints if the startLine is updated and the waypoint does not exist',
                default: 'true'
            },
            period: {
                type: 'number',
                title: 'The subscription period in microseconds used for position and wind deltas',
                default: 1000
            },
            timer: {
                type: 'number',
                title: 'Start Timer default initial period in seconds',
                default: 300
            },
        }
    }

    const unsubscribes = [];

    // Update meta data for non standard paths
    app.handleMessage('vessels.self', {
        context: "vessels.self",
        updates: [
            {
                timestamp: new Date().toISOString(),
                "meta": [
                    {
                        "path": "navigation.racing.startLineLength",
                        "value": {
                            "type": "number",
                            "units": "m",
                            "description": "Length of the start line",
                            "displayName": "Length of the start line",
                            "shortName": "SLL"
                        }
                    },
                    {
                        "path": "navigation.racing.stbLineBias",
                        "value": {
                            "type": "number",
                            "units": "m",
                            "description": "Bias of the start line for the starboard end",
                            "displayName": "Bias of the start line for the starboard end",
                            "shortName": "Bias"
                        }
                    },
                    {
                        "path": "navigation.racing.nextLegHeading",
                        "value": {
                            "type": "number",
                            "units": "rad",
                            "description": "Heading of the next leg of the course",
                            "displayName": "Next Heading",
                            "shortName": "NextHDG",
                        }
                    },
                    {
                        "path": "navigation.racing.nextLegTrueWindAngle",
                        "value": {
                            "type": "number",
                            "units": "rad",
                            "description": "TWA on the next leg of the course",
                            "displayName": "Next TWA",
                            "shortName": "NextTWA",
                        }
                    },
                    {
                        "path": "navigation.racing.startTime",
                        "value": {
                            "type": "string",
                            "description": "Time of the race start",
                            "displayName": "Start Time",
                            "shortName": "StartTime",
                        }
                    },
                ]
            }
        ]
    });

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

    function toOtherEnd(end) {
        switch (end) {
            case 'port' :
                return 'stb';
            case 'stb' :
                return 'port';
            default:
                return null;
        }
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

    function camelCase(name) {
        return name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
    }

    function complete(callback, statusCode, message, details) {
        const result = {state: statusCode === 200 ? 'SUCCESS' : 'FAILURE', statusCode, message, details};
        app.debug(JSON.stringify(result));
        return result;
    }

    // Put an absolute position
    async function putStartLineEnd(end, position, callback, updateWaypoint) {
        app.debug(`putStartLineEnd: ${end} ${JSON.stringify(position)}`);

        try {
            if (!end || !position || typeof position.latitude !== 'number' || typeof position.longitude !== 'number') {
                return complete(callback, 400, 'Failed to put start line end: !end || !position');
            }

            end = end.toLowerCase();
            if (end !== 'port' && end !== 'stb') {
                return complete(callback, 400, 'Failed to put start line end: unknown end');
            }

            let startLine = state.startLine;
            if (startLine) {
                // We have a line, check if this end is the same?
                if (startLine[end].latitude === position.latitude && startLine[end].longitude === position.longitude) {
                    return complete(callback, 304, 'Put start line end: unchanged line end');
                }
            } else {
                // We don't have a line, so check if this is just an update for one end of the line?
                const thisEnd = app.getSelfPath(`navigation.racing.startLine${camelCase(end)}`);
                if (thisEnd && thisEnd.value.lat === position.latitude && thisEnd.value.longitude === position.longitude) {
                    return complete(callback, 304, 'Put start line end: unchanged end');
                }

                // If we now have both ends, we have a line!
                const otherEnd = toOtherEnd(end);
                const otherEndPosition = app.getSelfPath(`navigation.racing.startLine${camelCase(otherEnd)}`);
                if (otherEndPosition && otherEndPosition.value) {
                    startLine = {};
                    startLine[end] = position;
                    startLine[otherEnd] = otherEnd.value;
                }
            }

            // If we have a startLine, we can send deltas for this end and the length
            if (startLine) {
                app.debug('update existing start line');
                const newStartLine = {...state.startLine};
                newStartLine[end] = position;
                startLine.length = geolib.getPreciseDistance(newStartLine.port, newStartLine.stb, 0.1);
                startLine.bearing = geolib.getRhumbLineBearing(newStartLine.stb, newStartLine.port);
                state.startLine = newStartLine;
                sendDeltas([
                    {path: `navigation.racing.startLine${camelCase(end)}`, value: position},
                    {path: 'navigation.racing.startLineLength', value: newStartLine.length},
                ]);
            } else {
                // otherwise we can only send the delta for this end
                sendDeltas([
                    {path: `navigation.racing.startLine${camelCase(end)}`, value: position},
                ]);
            }

            // Set/create the waypoint if we are configured to do so
            if (state.options.updateStartLineWaypoint || updateWaypoint) {
                const waypointConfig = `startLine${camelCase(end)}`;
                app.debug(`waypointConfig: ${waypointConfig}`);
                const waypointName = state.options[waypointConfig];
                app.debug(`waypointName: ${waypointName}`);
                let waypointId = startLine ? startLine[end + 'Id'] : null;
                app.debug(`waypointId: ${waypointId}`);

                // If we have not cached the Id of the line end, then
                if (!waypointId) {
                    // Get the ID of the last existing waypoint with the given name.
                    const waypoints = await app.resourcesApi.listResources('waypoints', {});
                    for (const [id, resource] of Object.entries(waypoints)) {
                        if (resource.name === waypointName) {
                            waypointId = id;
                            // don't break here as we want the last waypoint with the given name
                        }
                    }
                    app.debug(`waypointId: ${waypointId}`);
                }

                app.debug(`Startline waypoint to set ${end}(${waypointName}/${waypointId}): ${JSON.stringify(position)}`);

                const waypoint = {
                    name: waypointName,
                    feature: {
                        type: 'Feature',
                        geometry: {
                            type: 'Point',
                            coordinates: [position.longitude, position.latitude]
                        },
                        properties: {}
                    },
                    type: end === 'port' ? 'start-pin' : 'start-boat',
                    position: {
                        latitude: position.latitude,
                        longitude: position.longitude
                    }
                }

                app.debug(`waypoint: ${waypointId} -> ${end}/${waypointName} : ${JSON.stringify(waypoint)}`);

                if (waypointId)
                    await app.resourcesApi.setResource('waypoints', waypointId, waypoint);
                else if (state.options.createStartLineWaypoint)
                    await app.resourcesApi.createResource('waypoints', waypoint);
                else
                    app.debug('startline waypoint not created');
            } else {
                app.debug('startline waypoint not updated');
            }


            // If we have a startLine, then process position against the new line
            if (startLine)
                processPosition(null);
            // Complete the handler successfully
            return complete(callback, 200, 'Put start line end: OK');
        } catch (err) {
            return complete(callback, 500, 'Put start line end: Failed ' + JSON.stringify(err));
        }
    }

    async function setStartLine(context, path, args, callback) {
        try {
            app.debug('setStartLine:', JSON.stringify(args));
            if (!args || !args.end || typeof args.end !== 'string') {
                return complete(callback, 400, 'Failed to set the startLine: !end');
            }
            const end = args.end.toLowerCase();
            if (end !== 'port' && end !== 'stb') {
                return complete(callback, 400, 'Failed to set the startLine: unknown end');
            }

            // Get the position either as arg or as the current bow position
            let position = args.position;
            if (position === 'bow' || !position && !args.delta && !args.rotate ) {
                position = app.getSelfPath('navigation.position');
                app.debug('bowPosition:' + JSON.stringify(position));
                if (position)
                    position = bowPosition(position.value);
            }

            app.debug(`setStartLine[${end}] = ${JSON.stringify(position)} before translation/rotation`);
            const startLine = state.startLine;

            // Do any rotations or length changes
            if (startLine && (args.delta || args.rotate)) {
                app.debug(`setStartLine[${end}] translate ${args.delta} and rotate ${args.rotate} of ${JSON.stringify(startLine)}`);
                const otherEnd = startLine[toOtherEnd(end)];
                const thisEnd = position ? position : startLine[end];
                app.debug(`otherEnd(fixed): ${JSON.stringify(otherEnd)} thisEnd(moving): ${JSON.stringify(thisEnd)}`);

                const initialBearing = geolib.getRhumbLineBearing(otherEnd, thisEnd);
                const currentDistance = geolib.getDistance(otherEnd, thisEnd);
                app.debug(`initialBearing: ${initialBearing} currentDistance: ${currentDistance}`);

                const newDistance = args.delta && typeof args.delta === 'number' ? (currentDistance + args.delta) : currentDistance;
                const newBearing = args.rotate && typeof args.rotate === 'number' ? (initialBearing + toDegrees(args.rotate)) : initialBearing;
                app.debug(`newDistance: ${newDistance} newBearing: ${newBearing}`);

                const newPosition = geolib.computeDestinationPoint(otherEnd, newDistance, newBearing);
                app.debug(`Moved/Rotated ${end} from ${JSON.stringify(position)} to ${JSON.stringify(newPosition)}`);
                position = newPosition;
            }

            if (position)
                return putStartLineEnd(end, position, callback, args.updateWaypoint === true);
            return complete(callback, 500, 'Failed to set the startLine: No position');
        } catch (err) {
            return complete(callback, 500, 'Failed to set the startLine: ' + JSON.stringify(err));
        }
    }

    function setTimer() {
        if (state.timerInterval)
            clearInterval(state.timerInterval);
        state.timerInterval = setInterval(() => {
            if (!state.timerRunning || state.timeToStart <= 0) {
                clearInterval(state.timerInterval);
                return;
            }
            state.timeToStart--;
            sendDeltas([{path: 'navigation.racing.timeToStart', value: state.timeToStart}]);
        }, 1000);
    }

    async function startTimeCommand(context, path, args, callback) {
        // start / reset / sync
        try {
            app.debug('startTimerCommand:', JSON.stringify(args));
            if (!args || !args.command || typeof args.command !== 'string') {
                return complete(callback, 400, 'Failed to command timer: no command');
            }
            const command = args.command.toLowerCase();

            switch (command) {
                case 'start': {
                    const now = new Date();
                    const timeToStart = state.timeToStart ?? state.options.timer ?? 300;
                    const startTimestamp = new Date(now.getTime() + timeToStart * 1000).toISOString();

                    state.timerRunning = true;
                    state.startTime = startTimestamp;
                    state.timeToStart = timeToStart;

                    sendDeltas([
                        {path: 'navigation.racing.startTime', value: startTimestamp},
                        {path: 'navigation.racing.timeToStart', value: timeToStart}
                    ]);

                    setTimer();
                    return complete(callback, 200, 'start timer: OK');
                }
                case 'reset': {
                    state.timerRunning = false;
                    state.timeToStart = state.options.timer ?? 300;
                    if (state.timerInterval) clearInterval(state.timerInterval);

                    sendDeltas([
                        {path: 'navigation.racing.timeToStart', value: state.timeToStart},
                        {path: 'navigation.racing.startTime', value: null}
                    ]);
                    return complete(callback, 200, 'reset timer: OK');
                }

                case 'sync': {
                    if (!state.timerRunning || state.timeToStart == null) {
                        return complete(callback, 500, 'sync timer: !running');
                    }

                    const rounded = Math.round(state.timeToStart / 60) * 60;
                    state.timeToStart = rounded;
                    state.startTime = new Date(Date.now() + rounded * 1000).toISOString();

                    sendDeltas([
                        {path: 'navigation.racing.timeToStart', value: state.timeToStart},
                        {path: 'navigation.racing.startTime', value: state.startTime}
                    ]);
                    return complete(callback, 200, 'sync timer: OK');
                }

                case 'set': {
                    const input = args.startTime;
                    if (!input) {
                        return complete(callback, 400, 'reset timer: !startTime');
                    }

                    const inputTime = new Date(input);
                    if (isNaN(inputTime)) {
                        return complete(callback, 400, 'reset timer: invalid startTime');
                    }

                    const now = new Date();
                    const secondsToGo = Math.floor((inputTime - now) / 1000);

                    if (secondsToGo <= 0) {
                        state.timerRunning = false;
                        state.timeToStart = 0;
                        state.startTime = null;
                        sendDeltas([
                            {path: 'navigation.racing.timeToStart', value: 0},
                            {path: 'navigation.racing.startTime', value: null}
                        ]);
                        return complete(callback, 200, 'set timer: 0K');
                    }

                    state.timerRunning = true;
                    state.timeToStart = secondsToGo;
                    state.startTime = inputTime.toISOString();

                    sendDeltas([
                        {path: 'navigation.racing.timeToStart', value: state.timeToStart},
                        {path: 'navigation.racing.startTime', value: state.startTime}
                    ]);

                    setTimer();
                    return complete(callback, 200, 'set timer: OK');
                }

                case 'adjust': {
                    const delta = Number(args.delta);
                    if (isNaN(delta) || state.timeToStart == null || !state.startTime) {
                        cb(null, {state: 'FAILED', message: 'Cannot adjust: invalid state or delta'});
                        return;
                    }

                    state.timeToStart = Math.max(state.timeToStart + delta, 0);

                    if (state.timerRunning) {
                        let now = Date.now();
                        state.startTime = new Date(now - (now % 1000) + state.timeToStart * 1000).toISOString();
                    }

                    const deltas = [
                        { path: 'navigation.racing.timeToStart', value: state.timeToStart }
                    ];
                    if (state.timerRunning && state.startTime) {
                        deltas.push({path: 'navigation.racing.startTime', value: state.startTime });
                    }
                    sendDeltas(deltas);

                    return complete(callback, 200, 'adjust timer: OK');
                }

                default : {
                    return complete(callback, 400, 'Failed to command timer: unknown command');
                }
            }
        } catch (err) {
            app.debug('startTimerCommand:', JSON.stringify(err));
            return complete(callback, 500, 'Failed to command timer: ' + JSON.stringify(err));
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
                    if (value.name === state.options.startLinePort) {
                        let pos = waypointToPosition(value);
                        if (pos) {
                            startLine.portId = key;
                            startLine.port = pos;
                        }
                    }
                    if (value.name === state.options.startLineStb) {
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
        } else if (state.distanceToLine) {
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

    // Return the plugin
    return {
        id: 'signalk-racer',
        name: 'SignalK Racing Plugin',
        start: (options) => {
            if (!options.startLinePort || !options.startLineStb) {
                app.error('Missing waypoint names: startLinePort and/or startLineStb not configured.');
                return;
            }
            app.debug('startLinePort:' + options.startLinePort);
            app.debug('startLineStb:' + options.startLineStb);
            app.debug('app.selfId:' + app.selfId);

            let fromBow = app.getSelfPath('sensors.gps.fromBow');
            let fromCenter = app.getSelfPath('sensors.gps.fromCenter');
            state.options = options;
            state.wayPointsScanned = false;
            state.gpsFromBow = fromBow ? fromBow.value : null;
            state.gpsFromCenter = fromCenter ? fromCenter.value : null;
            state.timeToStart = options.timer;

            sendDeltas([{path: 'navigation.racing.timeToStart', value: state.timeToStart}]);

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
            );

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
            );

            // Subscribe to racing start line to see changes from any other plugin.
            app.subscriptionmanager.subscribe(
                {
                    context: 'vessels.' + app.selfId,
                    subscribe: [
                        {path: 'navigation.racing.startLinePort', policy: 'instant'},
                        {path: 'navigation.racing.startLineStb', policy: 'instant'},
                    ]
                },
                unsubscribes,
                (subscriptionError) => {
                    app.error('Error:' + subscriptionError)
                },
                (delta) => {
                    app.debug('DELTAS START LINE ENDS ' + JSON.stringify(delta));
                    delta.updates.forEach((u) => {
                        u.values.forEach((v) => {
                            app.debug(`DELTA START LINE END from ${u.source.label}: ${v.path} = ${JSON.stringify(v.value)}`);
                            if (u.source && u.source.label && u.source.label !== 'signalk-racer') {
                                switch (v.path) {
                                    case 'navigation.racing.startLinePort' :
                                        putStartLineEnd('port', v.value, ignored => {
                                        }, false).then(ignored => {
                                        });
                                        break;
                                    case 'navigation.racing.startLineStb' :
                                        putStartLineEnd('port', v.value, ignored => {
                                        }, false).then(ignored => {
                                        });
                                        break;
                                }
                            }
                        })
                    });
                }
            );

            // register to the standard path, so we can implement a direct put
            app.registerPutHandler('vessels.self', 'navigation.racing.startLinePort', (ctx, path, value, callback) => putStartLineEnd('port', value, callback));
            app.registerPutHandler('vessels.self', 'navigation.racing.startLineStb', (ctx, path, value, callback) => putStartLineEnd('stb', value, callback));

            // register to API paths for this plugin
            app.registerPutHandler('vessels.self', 'navigation.racing.setStartLine', setStartLine);
            app.registerPutHandler('vessels.self', 'navigation.racing.setStartTime', startTimeCommand);
        },

        stop: () => {
            unsubscribes.forEach((f) => f());
            unsubscribes.length = 0;
        },

        schema: () => racerSchema,

        getOpenApi: () => require('./openapi.json'),
    };
};

