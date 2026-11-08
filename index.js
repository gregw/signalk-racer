module.exports = (app) => {
    const state = {
        startLineName: null,
        // False once the line has been deactivated: no line is looked for or published
        // until one is selected again or an end of it is set.
        lineActive: true,
        startLine: null,
        // Last published best VMGs, so we only send deltas when they actually change.
        publishedBestVmg: {toCourseSide: null, fromCourseSide: null, toPortEnd: null, toStbEnd: null},
        publishedBestVmgOverrides: {toCourseSide: null, fromCourseSide: null, toPortEnd: null, toStbEnd: null},
        publishedEffectiveVmg: {toLine: null, alongLine: null, awayFromLine: null},
        // Last published start VMG zone angle (rad) and clearance (m).
        publishedStartVmgZone: {angle: null, clearance: null},
        publishedPolarVmg: {toCourseSide: null, fromCourseSide: null, toPortEnd: null, toStbEnd: null},
        publishedTunedFactor: {toCourseSide: null, fromCourseSide: null, toPortEnd: null, toStbEnd: null},
        // The polar management service, when one is running, and a handle on the raw
        // (unfactored) active polar, kept while the active selection is unchanged.
        polarService: null,
        rawPolar: null,
        // What the last position was measured with, for the webapp's VMG detail page.
        lastVmgInputs: null,
    };
    const geolib = require('geolib')
    const racerSchema = {
        title: 'Signalk Racer Configuration',
        type: 'object',
        properties: {
            startLineStb: {
                type: 'string',
                title: 'Start line starboard-end (boat) waypoint name',
                default: 'startBoat'
            },
            startLinePort: {
                type: 'string',
                title: 'Start line port-end (pin) waypoint name',
                default: 'startPin'
            },
            updateStartLineWaypoint: {
                type: 'boolean',
                title: 'Update the start line waypoints if the startLine is updated',
                default: true
            },
            createStartLineWaypoint: {
                type: 'boolean',
                title: 'Create the start line waypoints if the startLine is updated and the waypoint does not exist',
                default: true
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
            maxSamples : {
                type: 'number',
                title: 'Number of samples to collect for VMG calculations',
                default: 600
            },
            maxSampleAge: {
                type: 'number',
                title: 'Minutes after which VMG samples are discarded',
                default: 10
            },
            maxPolarRatio: {
                type: 'number',
                title: 'Percentage of the polar above which a VMG sample is discarded, as the boat is probably motoring',
                default: 120
            },
            percentile: {
                type: 'number',
                title: 'Percentile used to select sample for VMG calculations (0-1)',
                default: 0.9
            },
            minSog: {
                type: 'number',
                title: 'Minimum speed over ground (SOG) in knots to consider for VMG calculations',
                default: 1.0
            },
            minVmg: {
                type: 'number',
                title: 'Minimum VMG component in m/s for a sample to be collected in that direction',
                default: 0.01
            },
            minEffectiveVmg: {
                type: 'number',
                title: 'Minimum effective VMG in knots used to estimate time to line',
                default: 0.5
            },
            maxDistance: {
                type: 'number',
                title: 'Maximum distance to line and/or line zone in meters to consider for VMG calculations',
                default: 2000
            },
            startVmgZoneAngle: {
                type: 'number',
                title: 'Angle of the start VMG zone\'s edges, in degrees below the line\'s extension off each end (90 is just the span of the line)',
                default: 60
            },
            showLaylines: {
                type: 'boolean',
                title: 'Show the lay lines to each end of the line in the webapp\'s line view, from the published tack and gybe angles (performance.beatAngle and performance.gybeAngle), or 45 degrees off the wind when they are not published, and the TWD',
                default: true
            },
            clearance: {
                type: 'number',
                title: 'Boat lengths behind the line that a boat outside the start VMG zone, or OCS, approaches the zone from',
                default: 2
            },
            usePolars: {
                type: 'boolean',
                title: 'Use the active polar from signalk-polar-management, when it is installed, for the best VMGs',
                default: true
            },
            nearLineDistance: {
                type: 'number',
                title: 'Distance to line in nautical miles within which the line is calculated when the start timer is not counting down',
                default: 1
            },
            lines: {
                type: 'array',
                title: 'Named lines',
                description: 'Add zero or more named start lines',
                items: {
                    type: 'object',
                    title: 'Named line',
                    properties: {
                        startLineName: {
                            type: 'string',
                            title: 'Line name',
                        },
                        startLineStb: {
                            type: 'string',
                            title: 'Start line starboard-end (boat) waypoint name'
                        },
                        startLinePort: {
                            type: 'string',
                            title: 'Start line port-end (pin) waypoint name'
                        },
                        updateStartLineWaypoint: {
                            type: 'boolean',
                            title: 'Update the start line waypoints if the startLine is updated',
                            default: true
                        },
                        createStartLineWaypoint: {
                            type: 'boolean',
                            title: 'Create the start line waypoints if the startLine is updated and the waypoint does not exist',
                            default: true
                        },
                        startLineDescription: {
                            type: 'string',
                            title: 'Optional description'
                        }
                    },
                    required: ['startLineName', 'startLineStb', 'startLinePort']
                }
            }
        }
    }
    const { v4: uuidv4 } = require('uuid');
    const { courseReview, tackAngles } = require('./course');
    const { laylines } = require('./layline');
    const pluginVersion = require('./package.json').version;
    const {
        initRacer,
        toDegrees,
        toRadians,
        collectVmgSamples,
        resetVmgSamples,
        computeTimeToLine,
        startZoneDistances,
        effectiveVmg,
        vmgNames,
        getAllBestVmg,
        getBestVmgOverrides,
        setBestVmg,
        clearBestVmgOverrides,
        swapVmgEnds,
        setPolar,
        polarVmgs,
        getPolarVmgs,
        getTunedFactors,
        getVmgDetail,
    } = require('./racer');

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
                            "displayUnits": { "category": "length" },
                            "description": "Length of the start line",
                            "displayName": "Length of the start line",
                            "shortName": "SLL"
                        }
                    },
                    {
                        "path": "navigation.racing.distanceStartline",
                        "value": {
                            "type": "number",
                            "units": "m",
                            "displayUnits": { "category": "length" },
                            "description": "The minimum distance from the bow to the start line, via perpendicular approach",
                            "displayName": "Distance to the start line",
                            "shortName": "DTL"
                        }
                    },
                    {
                        "path": "navigation.racing.startLineBearing",
                        "value": {
                            "type": "number",
                            "units": "rad",
                            "description": "Bearing of the start line, from the starboard end (boat) to the port end (pin)",
                            "displayName": "Start line bearing",
                            "shortName": "SLB"
                        }
                    },
                    {
                        "path": "navigation.racing.effectiveVmg.toLine",
                        "value": {
                            "type": "number",
                            "units": "m/s",
                            "description": "VMG the leg across to the line, towards the course side, was divided by: the collected best, or the VMG being sailed right now if that is better (after a leg back to the clearance, the collected best for the final leg up to the line)",
                            "displayName": "Effective VMG to line",
                            "shortName": "VMG>Line"
                        }
                    },
                    {
                        "path": "navigation.racing.effectiveVmg.awayFromLine",
                        "value": {
                            "type": "number",
                            "units": "m/s",
                            "description": "VMG the leg back away from the line (back behind it, when OCS) was divided by, when there is one; zero otherwise",
                            "displayName": "Effective VMG away from line",
                            "shortName": "VMG<Line"
                        }
                    },
                    {
                        "path": "navigation.racing.startVmgZone.angle",
                        "value": {
                            "type": "number",
                            "units": "rad",
                            "description": "Angle of the start VMG zone's edges, below the line's extension off each end",
                            "displayName": "Start VMG zone angle",
                            "shortName": "Zone"
                        }
                    },
                    {
                        "path": "navigation.racing.startVmgZone.clearance",
                        "value": {
                            "type": "number",
                            "units": "m",
                            "description": "How far behind the line a boat outside the start VMG zone, or OCS, is charged for approaching the zone from, before sailing up to the line",
                            "displayName": "Start clearance",
                            "shortName": "Clr"
                        }
                    },
                    {
                        "path": "navigation.racing.effectiveVmg.alongLine",
                        "value": {
                            "type": "number",
                            "units": "m/s",
                            "description": "VMG the along-line leg of the time to line was divided by, zero when inside the start VMG zone",
                            "displayName": "Effective VMG along line",
                            "shortName": "VMG>Zone"
                        }
                    },
                    {
                        "path": "navigation.racing.bestVmg.toCourseSide",
                        "value": {
                            "type": "number",
                            "units": "m/s",
                            "description": "Best VMG collected sailing across the start line towards the course side, used to estimate time to line",
                            "displayName": "Best VMG to course side",
                            "shortName": "VMG>Course"
                        }
                    },
                    {
                        "path": "navigation.racing.bestVmg.fromCourseSide",
                        "value": {
                            "type": "number",
                            "units": "m/s",
                            "description": "Best VMG collected sailing back across the start line away from the course side, used to estimate time to line when OCS",
                            "displayName": "Best VMG from course side",
                            "shortName": "VMG<Course"
                        }
                    },
                    {
                        "path": "navigation.racing.bestVmg.toPortEnd",
                        "value": {
                            "type": "number",
                            "units": "m/s",
                            "description": "Best VMG collected sailing along the line towards the port end (pin), used to estimate time to line",
                            "displayName": "Best VMG to port end",
                            "shortName": "VMG>Port"
                        }
                    },
                    {
                        "path": "navigation.racing.bestVmg.toStbEnd",
                        "value": {
                            "type": "number",
                            "units": "m/s",
                            "description": "Best VMG collected sailing along the line towards the starboard end (committee boat), used to estimate time to line",
                            "displayName": "Best VMG to stb end",
                            "shortName": "VMG>Stb"
                        }
                    },
                    {
                        "path": "navigation.racing.stbLineBias",
                        "value": {
                            "type": "number",
                            "units": "m",
                            "displayUnits": { "category": "length" },
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
                            "units": "RFC 3339 (UTC)",
                            "example": "2014-04-10T08:33:53.123Z",
                            "format": "date-time",
                            "pattern" : ".*Z$",
                            "description": "Time of the race start in RFC 3339 UTC only format ",
                            "displayName": "Start Time",
                            "shortName": "StartTime",
                        }
                    },
                    {
                        "path": "navigation.racing.timeToLine",
                        "value": {
                            "type": "number",
                            "units": "s",
                            "description": "Time to sail to the the line at best VMG",
                            "displayName": "Time to line",
                            "shortName": "TTS"
                        }
                    },
                    {
                        "path": "navigation.racing.timeToBurn",
                        "value": {
                            "type": "number",
                            "units": "s",
                            "description": "Time to delay before sailing to the the start line",
                            "displayName": "Time to burn",
                            "shortName": "TTB"
                        }
                    }
                ]
            }
        ]
    });

    // Meta for the manual adjustment sitting beside each best VMG. Generated, since it
    // is the same shape for all four directions.
    app.handleMessage('vessels.self', {
        context: "vessels.self",
        updates: [
            {
                timestamp: new Date().toISOString(),
                "meta": Object.keys(vmgNames).flatMap(name => [{
                    "path": `navigation.racing.bestVmg.${name}.override`,
                    "value": {
                        "type": "number",
                        "units": "m/s",
                        "description": `Manual adjustment standing in for the collected ${name} VMG, null when not adjusted`,
                        "displayName": `Best VMG ${name} adjustment`,
                        "shortName": "Adjusted"
                    }
                }, {
                    "path": `navigation.racing.polarVmg.${name}`,
                    "value": {
                        "type": "number",
                        "units": "m/s",
                        "description": `VMG ${name} from the active polar for the current wind, without the performance factor, null without a polar`,
                        "displayName": `Polar VMG ${name}`,
                        "shortName": "PolarVMG"
                    }
                }, {
                    "path": `navigation.racing.tunedPerformanceFactor.${name}`,
                    "value": {
                        "type": "number",
                        "units": "ratio",
                        "description": `Performance factor ${name}, tuned from the samples, that the polar VMG is multiplied by for the best VMG, null without a polar`,
                        "displayName": `Tuned performance factor ${name}`,
                        "shortName": "Factor"
                    }
                }])
            }
        ]
    });

    // send multiple deltas, each in the form of { path, value }
    // null values are preserved (meaningful in SignalK for clearing a value);
    // undefined values are dropped to avoid "Delta is missing value" warnings.
    function sendDeltas(updatesArray) {
        const values = updatesArray
            .filter(({value}) => value !== undefined)
            .map(({path, value}) => ({path, value}));

        if (values.length === 0) return;

        const delta = {
            context: 'vessels.self',
            updates: [
                {
                    source: {label: 'signalk-racer'},
                    timestamp: new Date().toISOString(),
                    values
                }
            ]
        };

        app.debug('Sending deltas:', JSON.stringify(delta));
        app.handleMessage('vessels.self', delta);
    }

    // Publish the best (collected or overridden) VMGs used to estimate time to line.
    // processPosition runs on every position delta, so only changed values are sent.
    function publishBestVmg(position = {}) {
        const best = state.startLine ? getAllBestVmg() : null;
        const overrides = state.startLine ? getBestVmgOverrides() : null;
        const deltas = [];

        const polar = state.startLine ? getPolarVmgs() : null;
        const factors = state.startLine ? getTunedFactors() : null;
        const round = (v) => v == null ? null : Math.round(v * 1000) / 1000;

        for (const name of Object.keys(vmgNames)) {
            const polarValue = round(polar?.[name]);
            if (state.publishedPolarVmg[name] !== polarValue) {
                state.publishedPolarVmg[name] = polarValue;
                deltas.push({path: `navigation.racing.polarVmg.${name}`, value: polarValue});
            }
            const factor = round(factors?.[name]);
            if (state.publishedTunedFactor[name] !== factor) {
                state.publishedTunedFactor[name] = factor;
                deltas.push({path: `navigation.racing.tunedPerformanceFactor.${name}`, value: factor});
            }

            const value = best ? Math.round(best[name] * 1000) / 1000 : null;
            if (state.publishedBestVmg[name] !== value) {
                state.publishedBestVmg[name] = value;
                deltas.push({path: `navigation.racing.bestVmg.${name}`, value});
            }

            // The manual adjustment behind that value, as a sibling of it, or null
            // when the value is straight from the collected samples.
            const raw = overrides ? overrides[name] : null;
            const override = raw == null ? null : Math.round(raw * 1000) / 1000;
            if (state.publishedBestVmgOverrides[name] !== override) {
                state.publishedBestVmgOverrides[name] = override;
                deltas.push({path: `navigation.racing.bestVmg.${name}.override`, value: override});
            }
        }

        // The two VMGs the time to line was actually divided by. These are what a client
        // needs to draw the legs the estimate was built from; the collected bests above
        // are only half the story, since the boat sailing better than its history right
        // now wins. Only published once there is a position to resolve them against.
        if (position.lineBearing != null) {
            const effective = effectiveVmg(position.cog, position.sog, position.lineBearing,
                position.toZoneVz, position.ocs, position.closestEnd, position.retreat > 0);
            for (const leg of ['toLine', 'alongLine', 'awayFromLine']) {
                const value = state.startLine ? Math.round(effective[leg] * 1000) / 1000 : null;
                if (state.publishedEffectiveVmg[leg] !== value) {
                    state.publishedEffectiveVmg[leg] = value;
                    deltas.push({path: `navigation.racing.effectiveVmg.${leg}`, value});
                }
            }
        }

        if (deltas.length > 0)
            sendDeltas(deltas);
    }

    // Clear the effective VMGs, which are only meaningful while the line is in play.
    function clearEffectiveVmg() {
        const deltas = [];
        for (const leg of ['toLine', 'alongLine', 'awayFromLine']) {
            if (state.publishedEffectiveVmg[leg] !== null) {
                state.publishedEffectiveVmg[leg] = null;
                deltas.push({path: `navigation.racing.effectiveVmg.${leg}`, value: null});
            }
        }
        if (deltas.length > 0)
            sendDeltas(deltas);
    }

    function samePosition(a, b) {
        return !!a && !!b && a.latitude === b.latitude && a.longitude === b.longitude;
    }

    // Decide what to do with the collected VMG samples when the line is rediscovered.
    // The samples belong to a particular pair of line ends, tracked as state.vmgLine, so
    // that writing our own waypoints - or an edit to an unrelated waypoint - does not
    // discard them, and an exchange of the ends relabels them instead of clearing them.
    function reconcileVmgSamples(startLine) {
        const previous = state.vmgLine;
        if (samePosition(previous?.port, startLine.port) && samePosition(previous?.stb, startLine.stb))
            return;

        if (samePosition(previous?.port, startLine.stb) && samePosition(previous?.stb, startLine.port)) {
            app.debug('start line ends exchanged: swapping VMG samples');
            swapVmgEnds();
        } else {
            app.debug('start line changed: resetting VMG samples');
            resetVmgSamples();
        }
        state.vmgLine = {port: startLine.port, stb: startLine.stb};
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

    function selfNumber(path) {
        const value = app.getSelfPath(path)?.value;
        return typeof value === 'number' && Number.isFinite(value) ? value : null;
    }

    // How far behind the line a boat outside the start VMG zone, or OCS, approaches from:
    // boat lengths, from the boat's length overall, or 10 m a length when it is not known.
    function startClearance() {
        return (state.options?.clearance ?? 2) * (lengthOverall() ?? 10);
    }

    // The angle of the start VMG zone's edges below the line's extension, in degrees.
    function startVmgZoneAngle() {
        const angle = state.options?.startVmgZoneAngle;
        return typeof angle === 'number' && angle > 0 && angle <= 90 ? angle : 60;
    }

    function publishStartVmgZone(angle, clearance) {
        const values = {
            angle: angle == null ? null : Math.round(toRadians(angle) * 10000) / 10000,
            clearance: clearance == null ? null : Math.round(clearance * 10) / 10,
        };
        const deltas = [];
        for (const [key, value] of Object.entries(values)) {
            if (state.publishedStartVmgZone[key] !== value) {
                state.publishedStartVmgZone[key] = value;
                deltas.push({path: `navigation.racing.startVmgZone.${key}`, value});
            }
        }
        if (deltas.length > 0)
            sendDeltas(deltas);
    }

    // Follow signalk-polar-management's in-process service, announced through the
    // polarManagement property value. There is no npm dependency: without it, or without
    // an active polar, the best VMGs come from the samples alone.
    function discoverPolars() {
        if (state.options.usePolars === false || typeof app.onPropertyValues !== 'function')
            return;
        const unsubscribe = app.onPropertyValues('polarManagement', (history) => {
            const record = (history || []).findLast(entry => entry?.setter === 'signalk-polar-management');
            const service = record?.value;
            state.rawPolar = null;
            if (service?.apiVersion === 1 && service.available === true &&
                typeof service.activePolar === 'function' && typeof service.polar === 'function') {
                state.polarService = {service, active: service.activePolar()};
                app.debug('polar management service found');
            } else {
                state.polarService = null;
                app.debug('polar management service not available');
            }
        });
        if (typeof unsubscribe === 'function')
            unsubscribes.push(unsubscribe);
    }

    // The active polar without the performance factor, as a speedAt(tws, twa) function in
    // SI units, and the performance factor; or null when there is no active polar.
    function activePolar() {
        const polar = state.polarService;
        if (!polar) return null;
        try {
            const description = polar.active.describe();
            if (!description?.available) return null;
            const {id, sailplanId, performanceFactor, twsAxis} = description;
            if (state.rawPolar?.id !== id || state.rawPolar?.sailplanId !== sailplanId) {
                const handle = polar.service.polar(id, sailplanId ? {sailplanId} : {});
                state.rawPolar = {id, sailplanId, handle};
            }
            const handle = state.rawPolar.handle;
            const speedAt = (tws, twa) => {
                const value = handle.speedAt({tws, twa})?.value;
                return Number.isFinite(value) ? value : null;
            };
            // The polar's own best VMG angles upwind and downwind, radians.
            const targetAngles = (tws) => {
                try {
                    const value = typeof handle.targetsAt === 'function' ? handle.targetsAt({tws})?.value : null;
                    const beat = value?.beat?.twa, run = value?.run?.twa;
                    return Number.isFinite(beat) && Number.isFinite(run) ? {beatAngle: beat, gybeAngle: run} : null;
                } catch (err) {
                    return null;
                }
            };
            // The wind range the polar was measured over: ratios are only taken within it.
            const axis = Array.isArray(twsAxis) ? twsAxis.filter(Number.isFinite) : [];
            return {
                speedAt,
                targetAngles,
                performanceFactor: Number.isFinite(performanceFactor) ? performanceFactor : 1,
                minTws: axis.length ? Math.min(...axis) : null,
                maxTws: axis.length ? Math.max(...axis) : null,
            };
        } catch (err) {
            app.debug('polar unavailable: ' + err);
            return null;
        }
    }

    // Look the polar up for the current wind and line, setting it for the best VMGs, and
    // return what a sample taken now should be measured against: the raw polar VMG in each
    // direction, and the boat's speed ratio (speed through the water over the polar speed
    // at the angle sailed, or over the ground when there is no log or heading). Null
    // without a polar or wind, when the samples alone are used.
    function updatePolar(lineBearing, cog, sog) {
        const polar = activePolar();
        const tws = selfNumber('environment.wind.speedTrue');
        const twd = selfNumber('environment.wind.directionTrue');
        state.lastVmgInputs = {lineBearing, cog, sog, tws, twd, polar: !!polar};
        if (!polar || tws === null || twd === null) {
            setPolar(null);
            return null;
        }
        const vmg = polarVmgs(polar.speedAt, tws, twd, lineBearing);
        setPolar({vmg, performanceFactor: polar.performanceFactor});

        // Outside the wind range of the polar it is extrapolated, and least to be trusted: a
        // boat carrying its speed into a lull would score far above it. The polar is still
        // used for the best VMG, but no ratios are taken.
        const inRange = (polar.minTws === null || tws >= polar.minTws) &&
            (polar.maxTws === null || tws <= polar.maxTws);
        state.lastVmgInputs.ratiosTaken = inRange;
        if (!inRange)
            return null;

        let speedRatio = null;
        const stw = selfNumber('navigation.speedThroughWater');
        const heading = selfNumber('navigation.headingTrue');
        const speed = stw !== null && heading !== null ? stw : sog;
        const course = stw !== null && heading !== null ? heading : cog;
        if (Number.isFinite(speed) && Number.isFinite(course)) {
            const twa = Math.abs(Math.atan2(Math.sin(course - twd), Math.cos(course - twd)));
            const polarSpeed = polar.speedAt(tws, twa);
            if (polarSpeed > 0)
                speedRatio = speed / polarSpeed;
            Object.assign(state.lastVmgInputs, {
                speedSource: stw !== null && heading !== null ? 'water' : 'ground',
                speed, course, twa, polarSpeed, speedRatio,
            });
        }
        return {vmg, speedRatio};
    }

    function lengthOverall() {
        const length = app.getSelfPath('design.length')?.value;
        const overall = typeof length === 'number' ? length : length?.overall;
        return typeof overall === 'number' && Number.isFinite(overall) && overall > 0 ? overall : null;
    }

    // Servers before 2.34 took a GNSS antenna's fromCenter as positive to port.
    function antennaFromCenterIsPortPositive() {
        const [major, minor] = String(app.config?.version ?? '').split('.').map(Number);
        return Number.isFinite(major) && Number.isFinite(minor) && (major < 2 || major === 2 && minor < 34);
    }

    // The server's GNSS antenna configuration (2.31+) for the source of a position.
    // Sources are compared in canonical form, as an N2K source can be referenced by
    // either its address or its CAN name.
    function configuredAntenna(source) {
        const antennas = app.config?.settings?.gnssSensors;
        if (!Array.isArray(antennas))
            return null;
        const canonical = (ref) => app.deltaCache?.canonicaliseSourceRef?.(ref) ?? ref;
        const ref = canonical(source);
        const antenna = antennas.find(a => a?.$source && (a.$source === source || canonical(a.$source) === ref));
        if (!antenna || typeof antenna.fromBow !== 'number' || !Number.isFinite(antenna.fromBow))
            return null;
        let fromCenter = Number.isFinite(antenna.fromCenter) ? antenna.fromCenter : 0;
        if (antennaFromCenterIsPortPositive())
            fromCenter = -fromCenter;
        return {fromBow: antenna.fromBow, fromCenter};
    }

    // Where navigation.position is on the hull, as fromBow and fromCenter (positive to
    // starboard). Worked out each time, as the server configuration can change at any
    // time:
    //  1. A position corrected by the server is at the Consistent Common Reference Point
    //     (CCRP): midships on the centreline. It is either from a '.ccrp' source (the
    //     'both' correction mode) or from a configured antenna while 'replace' is active.
    //  2. A position from a configured antenna that is not being corrected is at that
    //     antenna.
    //  3. Otherwise sensors.gps.fromBow and fromCenter, as published by the server
    //     (2.35+) or set in the vessel settings.
    //  4. Otherwise the position is assumed to be the CCRP.
    // The server internals used for 1 and 2 are not part of the plugin API, so anything
    // missing falls through to 3.
    function positionOffsets() {
        const length = lengthOverall();
        const ccrp = length ? {fromBow: length / 2, fromCenter: 0} : null;
        const source = app.getSelfPath('navigation.position')?.$source;
        if (typeof source === 'string') {
            if (source.endsWith('.ccrp') && ccrp)
                return ccrp;
            const antenna = configuredAntenna(source);
            if (antenna) {
                const status = app.gnssOffsetCorrector?.getStatus?.();
                if (status?.mode === 'replace' && status.active && ccrp)
                    return ccrp;
                return antenna;
            }
        }

        const fromBow = selfNumber('sensors.gps.fromBow');
        const fromCenter = selfNumber('sensors.gps.fromCenter');
        if (fromBow != null || fromCenter != null)
            return {fromBow, fromCenter};
        return ccrp ?? {fromBow: null, fromCenter: null};
    }

    function bowPosition(position) {
        // Chosen on the values, as a heading that has dropped out stays with a null value.
        const heading = selfNumber('navigation.headingTrue') ?? selfNumber('navigation.courseOverGroundTrue');
        const {fromBow, fromCenter} = positionOffsets();
        if (heading == null || (!fromBow && !fromCenter))
            return position;

        const headingTrue = toDegrees(heading);

        let bow = position;
        if (fromBow)
            bow = geolib.computeDestinationPoint(bow, fromBow, headingTrue);
        // fromCenter is positive to starboard, so the centreline is to port of it.
        if (fromCenter)
            bow = geolib.computeDestinationPoint(bow, Math.abs(fromCenter), headingTrue + (fromCenter > 0 ? -90 : 90));
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

    function publishLineList() {
        const lines = Array.isArray(state.options.lines) ? state.options.lines : [];

        const payload = {
            // Stamped so a client can tell which build of the plugin is actually running.
            pluginVersion,
            startLineName: state.startLineName ?? null,
            active: state.lineActive,
            lines: lines.map(l => ({
                startLineName: l.startLineName,
                startLineDescription: l.startLineDescription || null
            }))
        };

        app.handleMessage('vessels.self', {
            context: "vessels.self",
            updates: [
                {
                    values: [
                        {
                            path: 'navigation.racing.lines',
                            value: payload
                        }
                    ]
                }
            ]
        });
    }
    
    // Set/create the waypoint for one end of the line, if we are configured to do so.
    // The cached waypoint ids stay bound to the configured waypoint *names*, so a
    // swap of the ends writes new positions into the same two waypoints.
    async function setEndWaypoint(end, position, startLine, updateWaypoint) {
        const startLineOptions = getStartLineOptions();
        if (!startLineOptions.updateStartLineWaypoint && !updateWaypoint) {
            app.debug('startline waypoint not updated');
            return;
        }

        try {
            const waypointConfig = `startLine${camelCase(end)}`;
            app.debug(`waypointConfig: ${waypointConfig}`);
            const waypointName = startLineOptions[waypointConfig];
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

            if (!waypointId && startLineOptions.createStartLineWaypoint)
                waypointId = uuidv4();
            if (waypointId)
                await app.resourcesApi.setResource('waypoints', waypointId, waypoint);
            else
                app.debug('startline waypoint not created');
        } catch (err) {
            app.error(`Failed to set startline waypoint: ${err}`);
        }
    }

    // Put an absolute position
    async function putStartLineEnd(end, position, callback, updateWaypoint) {
        app.debug(`putStartLineEnd: ${end} ${JSON.stringify(position)}`);

        try {
            if (!end || !position || typeof position.latitude !== 'number' || typeof position.longitude !== 'number')
                return complete(callback, 400, 'Failed to put start line end: !end || !position');

            end = end.toLowerCase();
            if (end !== 'port' && end !== 'stb')
                return complete(callback, 400, 'Failed to put start line end: unknown end');

            // Setting an end is setting up a line, so a deactivated line comes back.
            if (!state.lineActive) {
                state.lineActive = true;
                publishLineList();
            }

            let startLine = state.startLine;
            if (startLine) {
                // We have a line, check if this end is the same?
                if (startLine[end].latitude === position.latitude && startLine[end].longitude === position.longitude) {
                    // Already there, which is what was asked for.
                    return complete(callback, 200, 'Put start line end: unchanged line end');
                }

                app.debug('update existing start line');
                let newStartline = {...startLine};
                newStartline[end] = position;
                startLine = newStartline;
            } else {
                app.debug('No startLine');
                // We don't have a line, so check if this is just an update for one end of the line?
                const thisEnd = app.getSelfPath(`navigation.racing.startLine${camelCase(end)}`);
                app.debug('thisEnd ', JSON.stringify(thisEnd));
                if (thisEnd && thisEnd.value && thisEnd.value.latitude === position.latitude && thisEnd.value.longitude === position.longitude) {
                    return complete(callback, 200, 'Put start line end: unchanged end');
                }

                // If we now have both ends, we have a line!
                const otherEnd = toOtherEnd(end);
                app.debug('otherEnd ', otherEnd);
                const otherEndPosition = app.getSelfPath(`navigation.racing.startLine${camelCase(otherEnd)}`);
                app.debug('otherEndPosition ', otherEndPosition);
                if (otherEndPosition && otherEndPosition.value) {
                    startLine = {};
                    startLine[end] = position;
                    startLine[otherEnd] = otherEndPosition.value;
                    app.debug('startLine ', JSON.stringify(startLine));
                }
            }

            // If we have a startLine, we can send deltas for this end and the length
            if (startLine) {
                app.debug('send start line');
                startLine.length = geolib.getPreciseDistance(startLine.port, startLine.stb, 0.1);
                startLine.bearing = geolib.getRhumbLineBearing(startLine.stb, startLine.port);
                state.startLine = startLine;
                sendDeltas([
                    {path: `navigation.racing.startLine${camelCase(end)}`, value: position},
                    {path: 'navigation.racing.startLineLength', value: startLine.length},
                    {path: 'navigation.racing.startLineBearing', value: toRadians(startLine.bearing)},
                ]);
            } else {
                // otherwise we can only send the delta for this end
                sendDeltas([
                    {path: `navigation.racing.startLine${camelCase(end)}`, value: position},
                ]);
            }

            // Set/create the waypoint if we are configured to do so
            await setEndWaypoint(end, position, startLine, updateWaypoint);

            // If we have a startLine, then process position against the new line
            if (startLine)
                processPosition(null);
            // Complete the handler successfully
            return complete(callback, 200, 'Put start line end: OK');
        } catch (err) {
            return complete(callback, 500, 'Put start line end: Failed ' + err);
        }
    }

    // Select a line by name (null or empty for the default line), or with active false
    // deactivate the line. Active true without a name reactivates the selected line.
    async function setStartLineName(context, path, args, callback) {
        try {
            app.debug('setStartLineName:', JSON.stringify(args));
            if (!args || typeof args !== 'object'
                || args.startLineName != null && typeof args.startLineName !== 'string'
                || args.active != null && typeof args.active !== 'boolean') {
                return complete(callback, 400, 'Failed to set the startLine name!');
            }
            const named = args.active == null || Object.hasOwn(args, 'startLineName');
            const name = named ? (args.startLineName || null) : state.startLineName;
            const active = args.active ?? true;

            if (!active) {
                state.startLineName = name;
                if (state.lineActive)
                    deactivateLine();
            } else if (!state.lineActive || state.startLineName !== name || !state.startLine) {
                // Selecting the line in use while it has no ends looks for them again.
                state.lineActive = true;
                state.startLineName = name;
                state.startLine = null;
                findLineAndThenProcess(null, true);
            }
            publishLineList();
            return complete(callback, 200, active ? 'Put start line name: OK' : 'Deactivate start line: OK');
        } catch (err) {
            return complete(callback, 500, 'Put start line name: Failed ' + err);
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
            const startLine = state.startLine ? state.startLine : getStartLine();

            // Do any rotations or length changes
            if (startLine && (args.delta || args.rotate)) {
                app.debug(`setStartLine[${end}] translate ${args.delta} and rotate ${args.rotate} of ${JSON.stringify(startLine)}`);
                const otherEnd = startLine[toOtherEnd(end)];
                const thisEnd = position ? position : startLine[end];

                const initialBearing = geolib.getRhumbLineBearing(otherEnd, thisEnd);
                const currentDistance = geolib.getDistance(otherEnd, thisEnd);

                const delta = (args.delta && typeof args.delta === 'number' && end === 'stb') ? -args.delta : args.delta;
                const newDistance = delta && typeof delta === 'number' ? (currentDistance + args.delta) : currentDistance;
                const newBearing = args.rotate && typeof args.rotate === 'number' ? (initialBearing + toDegrees(args.rotate)) : initialBearing;

                const newPosition = geolib.computeDestinationPoint(otherEnd, newDistance, newBearing);
                app.debug(`Moved/Rotated ${end} from ${JSON.stringify(position)} to ${JSON.stringify(newPosition)}`);
                position = newPosition;
            }

            if (position)
                return putStartLineEnd(end, position, callback, getStartLineOptions().updateStartLineWaypoint);
            return complete(callback, 500, 'Failed to set the startLine: No position');
        } catch (err) {
            return complete(callback, 500, 'Failed to set the startLine: ' + err);
        }
    }

    // Swap the port and starboard ends of the line, reversing its bearing.
    async function swapStartLineEnds(context, path, args, callback) {
        try {
            app.debug('swapStartLineEnds:', JSON.stringify(args));
            const startLine = state.startLine ? state.startLine : getStartLine();
            if (!startLine || !startLine.port || !startLine.stb)
                return complete(callback, 400, 'Failed to swap the startLine: no line');

            // Swap the positions. The cached waypoint ids stay bound to their configured
            // names, so each waypoint keeps its identity and receives the other position.
            const swapped = {...startLine, port: startLine.stb, stb: startLine.port};
            swapped.length = geolib.getPreciseDistance(swapped.port, swapped.stb, 0.1);
            swapped.bearing = geolib.getRhumbLineBearing(swapped.stb, swapped.port);
            app.debug(`swapped startLine: ${JSON.stringify(swapped)}`);
            state.startLine = swapped;

            // Every collected VMG sample is still valid, just relabelled. Record the
            // ends they now belong to, so the rescan triggered by our own waypoint
            // writes below sees no change and leaves them alone.
            swapVmgEnds();
            state.vmgLine = {port: swapped.port, stb: swapped.stb};

            // Send both ends together, so no consumer ever sees a half swapped line.
            sendDeltas([
                {path: 'navigation.racing.startLinePort', value: swapped.port},
                {path: 'navigation.racing.startLineStb', value: swapped.stb},
                {path: 'navigation.racing.startLineLength', value: swapped.length},
                {path: 'navigation.racing.startLineBearing', value: toRadians(swapped.bearing)},
            ]);

            await setEndWaypoint('port', swapped.port, swapped);
            await setEndWaypoint('stb', swapped.stb, swapped);

            processPosition(null);
            processWind();
            return complete(callback, 200, 'Swap start line ends: OK');
        } catch (err) {
            return complete(callback, 500, 'Failed to swap the startLine: ' + err);
        }
    }

    // Set, adjust or reset the best VMGs used to estimate time to line.
    async function setBestVmgCommand(context, path, args, callback) {
        try {
            app.debug('setBestVmgCommand:', JSON.stringify(args));
            if (!args)
                return complete(callback, 400, 'Failed to set best VMG: no value');

            if (args.command === 'clear') {
                // Throw away everything collected, not just the manual adjustments, so
                // the estimate starts again from what the boat does next.
                resetVmgSamples({pool: true});
                publishBestVmg();
                return complete(callback, 200, 'Cleared best VMG samples: OK');
            }

            if (args.command === 'reset') {
                // No vmg name clears every override.
                if (!clearBestVmgOverrides(args.vmg))
                    return complete(callback, 400, 'Failed to reset best VMG: unknown vmg');
                publishBestVmg();
                return complete(callback, 200, 'Reset best VMG: OK');
            }

            const value = setBestVmg(args.vmg, args);
            if (value === null)
                return complete(callback, 400, 'Failed to set best VMG: unknown vmg, or no value/delta');
            publishBestVmg();
            return complete(callback, 200, `Set best VMG ${args.vmg}: OK`);
        } catch (err) {
            return complete(callback, 500, 'Failed to set best VMG: ' + err);
        }
    }

    // Direct put to navigation.racing.bestVmg.<name>, accepting either a bare
    // number (m/s) or a {value} / {delta} object.
    function putBestVmg(name, value, callback) {
        try {
            const args = (value !== null && typeof value === 'object') ? value : {value};
            if (setBestVmg(name, args) === null)
                return complete(callback, 400, `Failed to put best VMG ${name}: invalid value`);
            publishBestVmg();
            return complete(callback, 200, `Put best VMG ${name}: OK`);
        } catch (err) {
            return complete(callback, 500, `Failed to put best VMG ${name}: ` + err);
        }
    }

    // At the gun, manual VMG adjustments give way to the collected samples.
    function clearBestVmgOverridesAtStart() {
        clearBestVmgOverrides();
        publishBestVmg();
    }

    // Whole seconds still to go until startTime, as a countdown shows them.
    function secondsToStart(startTime, now = Date.now()) {
        return Math.max(0, Math.ceil((Date.parse(startTime) - now) / 1000));
    }

    function clearTimer() {
        if (state.timerInterval)
            clearTimeout(state.timerInterval);
        state.timerInterval = null;
    }

    // While running, startTime is the source of truth: each tick works timeToStart out
    // from it again, so late ticks never accumulate, and the next tick is scheduled for
    // just after the next whole second before startTime.
    function setTimer() {
        clearTimer();
        if (!state.timerRunning || !state.startTime)
            return;
        const tick = () => {
            state.timerInterval = null;
            if (!state.timerRunning || !state.startTime)
                return;
            const now = Date.now();
            const timeToStart = secondsToStart(state.startTime, now);
            if (timeToStart !== state.timeToStart) {
                state.timeToStart = timeToStart;
                sendDeltas([{path: 'navigation.racing.timeToStart', value: state.timeToStart}]);
                if (state.timeToStart <= 0)
                    clearBestVmgOverridesAtStart();
            }
            if (state.timeToStart > 0) {
                const untilNext = Date.parse(state.startTime) - now - (state.timeToStart - 1) * 1000;
                state.timerInterval = setTimeout(tick, Math.max(1, untilNext));
            }
        };
        state.timeToStart = secondsToStart(state.startTime);
        tick();
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

                    setTimer();
                    sendDeltas([
                        {path: 'navigation.racing.startTime', value: startTimestamp},
                        {path: 'navigation.racing.timeToStart', value: timeToStart}
                    ]);

                    return complete(callback, 200, 'start timer: OK');
                }
                case 'reset': {
                    state.timerRunning = false;
                    state.timeToStart = state.options.timer ?? 300;
                    clearTimer();

                    sendDeltas([
                        {path: 'navigation.racing.timeToStart', value: state.timeToStart},
                        {path: 'navigation.racing.startTime', value: null}
                    ]);
                    return complete(callback, 200, 'reset timer: OK');
                }

                case 'sync': {
                    if (!state.timerRunning || state.timeToStart == null)
                        return complete(callback, 500, 'sync timer: !running');

                    const rounded = Math.round(secondsToStart(state.startTime) / 60) * 60;
                    state.timeToStart = rounded;
                    state.startTime = new Date(Date.now() + rounded * 1000).toISOString();

                    setTimer();
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

                    const secondsToGo = secondsToStart(inputTime.toISOString());

                    if (secondsToGo <= 0) {
                        state.timerRunning = false;
                        state.timeToStart = 0;
                        state.startTime = null;
                        sendDeltas([
                            {path: 'navigation.racing.timeToStart', value: 0},
                            {path: 'navigation.racing.startTime', value: null}
                        ]);
                        clearBestVmgOverridesAtStart();
                        return complete(callback, 200, 'set timer: Ignored negative start time');
                    }

                    state.timerRunning = true;
                    state.timeToStart = secondsToGo;
                    state.startTime = inputTime.toISOString();

                    setTimer();
                    sendDeltas([
                        {path: 'navigation.racing.timeToStart', value: state.timeToStart},
                        {path: 'navigation.racing.startTime', value: state.startTime}
                    ]);

                    return complete(callback, 200, 'set timer: OK');
                }

                case 'adjust': {
                    const delta = Number(args.delta);
                    if (isNaN(delta))
                        return complete(callback, 400, 'adjust timer: Cannot adjust invalid delta');

                    if (state.timeToStart == null)
                        return complete(callback, 400, 'adjust timer: Cannot adjust start time');

                    // A running countdown shifts its startTime, keeping its sub-second offset.
                    const nextStartTime = state.timerRunning && state.startTime
                        ? new Date(Date.parse(state.startTime) + delta * 1000).toISOString()
                        : null;
                    const nextTimeToStart = nextStartTime ? secondsToStart(nextStartTime) : state.timeToStart + delta;
                    if (nextTimeToStart <= 0)
                        return complete(callback, 200, 'adjust timer: Ignored negative start time');

                    state.timeToStart = nextTimeToStart;
                    if (nextStartTime)
                        state.startTime = nextStartTime;

                    const deltas = [
                        { path: 'navigation.racing.timeToStart', value: state.timeToStart }
                    ];
                    if (state.timerRunning && state.startTime) {
                        deltas.push({path: 'navigation.racing.startTime', value: state.startTime });
                    }
                    setTimer();

                    sendDeltas(deltas);

                    return complete(callback, 200, 'adjust timer: OK');
                }

                default : {
                    return complete(callback, 400, 'Failed to command timer: unknown command');
                }
            }
        } catch (err) {
            app.debug('startTimerCommand:', err);
            return complete(callback, 500, 'Failed to command timer: ' + err.message);
        }
    }

    // Stop using the line: its ends and everything worked out from it are cleared, but
    // the waypoints are left alone, so it can be selected again.
    function deactivateLine() {
        app.debug('deactivateLine');
        state.lineActive = false;
        state.startLine = null;
        sendDeltas([
            {path: 'navigation.racing.startLinePort', value: null},
            {path: 'navigation.racing.startLineStb', value: null},
            {path: 'navigation.racing.startLineLength', value: null},
            {path: 'navigation.racing.startLineBearing', value: null},
        ]);
        clearLineDeltas(true);
    }

    function findLineAndThenProcess(position, alwaysFindLine = false) {
        if (!state.lineActive)
            return;
        if (!state.startLine || alwaysFindLine) {
            app.resourcesApi.listResources(
                'waypoints',
                {}
            ).then(data => {
                // Deactivated while the waypoints were being listed.
                if (!state.lineActive)
                    return;
                state.wayPointsScanned = true;

                const startLine = {
                    stb: null,
                    port: null,
                    length: null,
                    bearing: null,
                }
                const startLineOptions = getStartLineOptions();
                app.debug(`Start Line Options [${state.startLineName}]:`, JSON.stringify(startLineOptions));
                for (const [key, value] of Object.entries(data)) {
                    app.debug(`WAYPOINT: ${key}, Value:`, JSON.stringify(value));
                    if (value.name === startLineOptions.startLinePort) {
                        let pos = waypointToPosition(value);
                        if (pos) {
                            startLine.portId = key;
                            startLine.port = pos;
                        }
                    }
                    if (value.name === startLineOptions.startLineStb) {
                        let pos = waypointToPosition(value);
                        if (pos) {
                            startLine.stbId = key;
                            startLine.stb = pos;
                        }
                    }
                }

                let deltas;
                if (startLine.port && startLine.stb) {
                    startLine.length = geolib.getPreciseDistance(startLine.port, startLine.stb, 0.1);
                    startLine.bearing = geolib.getRhumbLineBearing(startLine.stb, startLine.port);

                    app.debug(`STARTLINE: startLinePort: ${JSON.stringify(startLine)}`);
                    state.startLine = startLine;
                    reconcileVmgSamples(startLine);
                    deltas = [
                        {path: 'navigation.racing.startLinePort', value: startLine.port},
                        {path: 'navigation.racing.startLineStb', value: startLine.stb},
                        {path: 'navigation.racing.startLineLength', value: startLine.length},
                        {path: 'navigation.racing.startLineBearing', value: toRadians(startLine.bearing)},
                    ].filter(entry => entry.value !== null && entry.value !== undefined);
                } else {
                    app.debug(`STARTLINE: undefined`);
                    state.startLine = null;
                    deltas = [
                        {path: 'navigation.racing.startLinePort', value: null},
                        {path: 'navigation.racing.startLineStb', value: null},
                        {path: 'navigation.racing.startLineLength', value: null},
                        {path: 'navigation.racing.startLineBearing', value: null},
                    ];
                }
                if (deltas.length > 0) {
                    sendDeltas(deltas);
                    processPosition(position);
                    processWind();
                }
            }).catch(err => {
                app.error(err);
            });
        } else {
            processPosition(position);
        }
    }

    /**
     * Whether the line is worth calculating: always while the start timer is counting
     * down, otherwise only within nearLineDistance of it. The active route plays no part:
     * its point index says nothing reliable about where the start is.
     */
    function isLineInPlay(distanceToLine) {
        if (state.timerRunning && state.timeToStart > 0)
            return true;
        const nearLine = (state.options.nearLineDistance ?? 1) * 1852;
        return distanceToLine != null && Math.abs(distanceToLine) <= nearLine;
    }

    function processPosition(position) {
        if (!position) {
            position = app.getSelfPath('navigation.position');
            app.debug('POSITION:' + JSON.stringify(position));
            position = position ? position.value : null;
        }

        const startLine = state.startLine;

        app.debug(`processPosition ${JSON.stringify(position)} to ${JSON.stringify(startLine)}`);
        if (position && startLine) {
            // handle the bow offset
            const bow = bowPosition(position);

            // Get the distance to each end of the line
            const toPort = geolib.getPreciseDistance(bow, startLine.port, 0.1);
            const toStb = geolib.getPreciseDistance(bow, startLine.stb, 0.1);

            // which is the closest end
            const closest = toPort < toStb ? startLine.port : startLine.stb;
            let toEnd;
            let bearingToEnd;
            let angle;
            let closestEnd;
            if (closest === state.startLine.port) {
                closestEnd = 'port';
                toEnd = toPort;
                app.debug('closest to Port(pin):' + toPort);
                bearingToEnd = geolib.getRhumbLineBearing(bow, startLine.port);
                angle = bearingToEnd - startLine.bearing;
            } else {
                closestEnd = 'stb';
                toEnd = toStb;
                app.debug('closest to Stb(boat):' + toStb);
                bearingToEnd = geolib.getRhumbLineBearing(bow, startLine.stb);
                angle = 180 - (bearingToEnd - startLine.bearing);
            }
            angle = ((angle + 180) % 360 + 360) % 360 - 180;

            // The start VMG zone lies between a line off each end at startVmgZoneAngle
            // (60 degrees) below the line's extension.
            // - Inside the zone, distanceToLine = perpendicular to the line (or extension).
            // - Outside it, back to the clearance depth if shallower than that (tapering to
            //   nothing at the zone's edge), along the line at that depth into the zone,
            //   then up to the line.
            // - When OCS, back across the line to the full clearance, then the same.
            // distanceToLine is the total of those legs, or minus the distance over the
            // line when OCS.
            // The geometry itself lives in racer.js so it can be unit tested.
            const clearance = startClearance();
            const zoneAngle = startVmgZoneAngle();
            const {ocs, perpToLineVx, retreat, toZoneVz, depth, distanceToLine} =
                startZoneDistances(toEnd, angle, clearance, zoneAngle);
            app.debug('distanceToLine:' + distanceToLine);
            if (!isLineInPlay(distanceToLine)) {
                clearLineDeltas();
                return;
            }
            state.distanceToLine = distanceToLine;
            state.lastLeg = {ocs, retreat, toZoneVz, depth, perpToLineVx, closestEnd, clearance, zoneAngle};

            // Collect VMG samples
            const cog = app.getSelfPath("navigation.courseOverGroundTrue")?.value;
            const sog = app.getSelfPath("navigation.speedOverGround")?.value;
            const polar = updatePolar(startLine.bearing, cog, sog);
            if (cog != null && sog != null) {
                collectVmgSamples(cog, sog, startLine.bearing, toZoneVz, perpToLineVx, polar);
            }
            const ttl = computeTimeToLine(cog, sog, startLine.bearing, toZoneVz, perpToLineVx, ocs, closestEnd,
                state.timeToStart ?? 0, depth);
            // Time to burn stands when OCS too: the time to line is then the time to get
            // back over the line from the course side, so the spare time before you have
            // to turn and do it is just as real - and goes negative when you have left it
            // too late, which is exactly when it is worth reading.
            const ttb = state.timerRunning && state.timeToStart > 0 && ttl != null ? (state.timeToStart - ttl) : null;

            sendDeltas([
                {path: 'navigation.racing.distanceStartline', value: distanceToLine},
                {path: "navigation.racing.timeToLine", value: ttl},
                {path: "navigation.racing.timeToBurn", value: ttb}
            ]);
            publishBestVmg({ocs, retreat, toZoneVz, closestEnd, cog, sog, lineBearing: startLine.bearing});
            publishStartVmgZone(zoneAngle, clearance);

        } else {
            clearLineDeltas();
        }
    }

    function clearLineDeltas(force = false) {
        if (state.distanceToLine == null && !force)
            return;
        state.distanceToLine = null;
        sendDeltas([
            {path: 'navigation.racing.distanceStartline', value: null},
            {path: 'navigation.racing.stbLineBias', value: null},
            {path: 'navigation.racing.timeToLine', value: null},
            {path: 'navigation.racing.timeToBurn', value: null},
        ]);
        publishBestVmg();
        clearEffectiveVmg();
        publishStartVmgZone(null, null);
    }

    function processWind(twd) {
        if (twd === undefined) {
            twd = app.getSelfPath('environment.wind.directionTrue');
            app.debug('TWD:' + JSON.stringify(twd));
            twd = twd ? twd.value : null;
        }

        // A TWD of 0 is a northerly, so test for a number rather than truthiness.
        if (!Number.isFinite(twd))
            return;

        let nextTwa = null;
        const activeRoute = state.activeRoute;
        if (activeRoute && activeRoute.nextLegHeading) {
            nextTwa = (540 + toDegrees(twd) - activeRoute.nextLegHeading) % 360 - 180;
            app.debug(`nextTwa: ${nextTwa}`);
        }

        let bias = null;
        const startLine = state.startLine;
        if (startLine && isLineInPlay(state.distanceToLine)) {
            app.debug(`processWind ${twd} to ${JSON.stringify(startLine)}`);
            bias = - startLine.length * Math.cos(toRadians(startLine.bearing) - twd);
        }

        sendDeltas([
            {path: 'navigation.racing.stbLineBias', value: bias},
            {path: 'navigation.racing.nextLegTrueWindAngle', value: toRadians(nextTwa)},
        ].filter(entry => entry.value !== null && entry.value !== undefined));
    }

    function processRoute(activeRoute) {
        if (activeRoute) {
            // e.g. {"href":"/resources/routes/a12eefe7-8fd3-49f7-81af-ce1f3440d3ff","name":"Course 1","reverse":false,"pointIndex":1,"pointTotal":5}
            const nextPointIndex = activeRoute.pointIndex + 1;
            if (nextPointIndex < 0 || nextPointIndex === activeRoute.pointTotal) {
              activeRoute.nextLegHeading = null;
              sendDeltas([
                {path: 'navigation.racing.nextLegHeading', value: null},
                {path: 'navigation.racing.nextLegTrueWindAngle', value: null}
              ]);
              processPosition();
              return;
            }

            const routeId = activeRoute.href.split('/').pop(); //  e.g. "a12eefe7-8fd3-49f7-81af-ce1f3440d3ff"
            app.debug('processRoute:' + routeId);
            app.resourcesApi.getResource('routes', routeId).then(route => {
                app.debug('found active route:', JSON.stringify(route));
                // e.g. {
                // name:"Course 1",
                // description:"Test race course",
                // distance:3027,
                // feature:{
                //   type:"Feature",
                //   geometry:{
                //     type:"LineString",
                //     coordinates:[[151.27,-33.80],[151.28,-33.81],[151.27,-33.80],[151.27,-33.80],[151.27,-33.80]]},
                //     properties:{
                //       coordinatesMeta:[
                //         {href:"/resources/waypoints/bb35d9d0-c04e-4721-89f2-a1d8e697ab81"},
                //         {href:"/resources/waypoints/65082ddd-6fa6-4538-9a01-49d5d795b0bb"},
                //         {href:"/resources/waypoints/0bbce508-67c6-4f03-8de0-fb0532f88917"},
                //         {href:"/resources/waypoints/602ee562-c6dc-42c3-a775-512597063ca4"},
                //         {href:"/resources/waypoints/2e3cf194-8835-498d-abaa-a5d2104550b3"}
                //       ]
                //     },
                //     id:""
                //   },
                //   timestamp:"2025-06-09T22:22:54.739Z",
                //   $source:"resources-provider"}
                const coordinates = route.feature.geometry.coordinates;
                const fromIndex = activeRoute.reverse ? activeRoute.pointTotal - activeRoute.pointIndex - 1 : activeRoute.pointIndex;
                const toIndex = activeRoute.reverse ? activeRoute.pointTotal - nextPointIndex - 1 : nextPointIndex;
                const [fromLongitude, fromLatitude] = coordinates[fromIndex];
                const [toLongitude, toLatitude] = coordinates[toIndex];
                app.debug(`from: {longitude:${fromLongitude}, latitude:${fromLatitude}}, to: {longitude:${toLongitude}, latitude:${toLatitude}}`);
                const nextLegHeading = geolib.getRhumbLineBearing(
                    {latitude: fromLatitude, longitude: fromLongitude},
                    {latitude: toLatitude, longitude: toLongitude});
                app.debug(`nextLegHeading: ${nextLegHeading}`);

                activeRoute.nextLegHeading = nextLegHeading;
                state.activeRoute = activeRoute;
                sendDeltas([
                    {path: 'navigation.racing.nextLegHeading', value: toRadians(nextLegHeading)},
                    {path: 'navigation.racing.nextLegTrueWindAngle', value: null}
                ]);
                processWind();
            }).catch(err => {
                app.error(err);
            });
        } else {
            state.activeRoute = null;
            sendDeltas([
                {path: 'navigation.racing.nextLegHeading', value: null},
                {path: 'navigation.racing.nextLegTrueWindAngle', value: null}
            ]);
            processPosition(null);
        }
    }
    
    function getStartLineOptions() {
        app.debug("getStartLineOptions for ", state.startLineName);
        for (const lineOption of state.options.lines) {
            if (lineOption.startLineName === state.startLineName) {
                app.debug("lineOption: ", JSON.stringify(lineOption));
                return lineOption;
            }
        }
        app.debug("lineOption: ", JSON.stringify(state.options));
        return state.options;
    }

    function getStartLine() {
        const stbEnd = app.getSelfPath(`navigation.racing.startLineStb`);
        const portEnd = app.getSelfPath(`navigation.racing.startLinePort`);
        if (stbEnd && stbEnd.value && portEnd && portEnd.value) {
            let startLine = { stb: stbEnd.value, port: portEnd.value};
            startLine.length = geolib.getPreciseDistance(startLine.port, startLine.stb, 0.1);
            startLine.bearing = geolib.getRhumbLineBearing(startLine.stb, startLine.port);
            state.startLine = startLine;
            app.debug('found startLine ', JSON.stringify(startLine));
            return startLine;
        }
        return null;
    }

    // The active route, from the server's Course API. Servers that keep the course only in
    // the v2 API do not publish navigation.course.activeRoute in the v1 data model, so ask
    // the Course API, and fall back to the v1 path for servers without getCourse.
    async function currentActiveRoute() {
        return (await currentCourse()).activeRoute;
    }

    // The active route and the position of the point being sailed to, as above.
    async function currentCourse() {
        if (typeof app.getCourse === 'function') {
            try {
                const course = await app.getCourse();
                return {activeRoute: course?.activeRoute ?? null, nextPoint: course?.nextPoint?.position ?? null};
            } catch (err) {
                app.debug('getCourse: ' + err);
            }
        }
        const nextPoint = app.getSelfPath('navigation.course.nextPoint')?.value?.position
            ?? app.getSelfPath('navigation.courseGreatCircle.nextPoint.position')?.value
            ?? app.getSelfPath('navigation.courseRhumbline.nextPoint.position')?.value ?? null;
        return {activeRoute: app.getSelfPath('navigation.course.activeRoute')?.value ?? null, nextPoint};
    }

    // Follow the active route from the Course API, at most every few seconds, as its changes
    // do not reach a v1 subscription on servers that keep the course only in the v2 API.
    function checkActiveRoute() {
        const now = Date.now();
        if (state.activeRouteChecked && now - state.activeRouteChecked < 5000)
            return;
        state.activeRouteChecked = now;
        currentCourse().then(({activeRoute, nextPoint}) => {
            state.nextPoint = Number.isFinite(nextPoint?.latitude) && Number.isFinite(nextPoint?.longitude)
                ? nextPoint : null;
            const key = activeRoute
                ? `${activeRoute.href}|${activeRoute.pointIndex}|${activeRoute.reverse}`
                : null;
            if (key === state.activeRouteKey)
                return;
            state.activeRouteKey = key;
            processRoute(activeRoute);
        }).catch(err => app.debug('active route: ' + err));
    }

    // The tack and gybe angles for the lay lines, radians, re-resolved every few seconds:
    // as published, else the polar's best VMG angles in the wind, else 45 and 135 degrees.
    function laylineAngles() {
        const now = Date.now();
        if (!state.laylineAngles || now - state.laylineAngles.at > 5000) {
            const polar = activePolar();
            const tws = selfNumber('environment.wind.speedTrue');
            const angles = tackAngles({
                beatAngle: selfNumber('performance.beatAngle'),
                gybeAngle: selfNumber('performance.gybeAngle'),
                polarAngles: polar && tws !== null ? polar.targetAngles(tws) : null,
                speedAt: polar && tws !== null ? (twa) => polar.speedAt(tws, twa) : null,
            });
            state.laylineAngles = {at: now, beat: toRadians(angles.beatAngle), gybe: toRadians(angles.gybeAngle)};
        }
        return state.laylineAngles;
    }

    // The distance and time to the lay lines into the point being sailed to, on the current
    // COG and SOG (see layline.js), published on the spec's navigation.racing.layline and
    // oppositeLayline paths, and cleared once when they can't be worked out.
    function processLaylines(position) {
        const mark = state.nextPoint;
        let result = null;
        if (mark && Number.isFinite(position?.latitude) && Number.isFinite(position?.longitude)) {
            const angles = laylineAngles();
            result = laylines({
                bearing: toRadians(geolib.getRhumbLineBearing(position, mark)),
                distance: geolib.getPreciseDistance(position, mark, 0.1),
                cog: selfNumber('navigation.courseOverGroundTrue'),
                sog: selfNumber('navigation.speedOverGround'),
                twd: selfNumber('environment.wind.directionTrue'),
                beatAngle: angles.beat,
                gybeAngle: angles.gybe,
            });
        }
        if (!result && !state.laylinesPublished)
            return;
        state.laylinesPublished = !!result;
        sendDeltas([
            {path: 'navigation.racing.layline.distance', value: result?.layline.distance ?? null},
            {path: 'navigation.racing.layline.time', value: result?.layline.time ?? null},
            {path: 'navigation.racing.oppositeLayline.distance', value: result?.oppositeLayline.distance ?? null},
            {path: 'navigation.racing.oppositeLayline.time', value: result?.oppositeLayline.time ?? null},
        ]);
    }

    // A route's points in the route's own order, each named from the waypoint it refers to
    // when there is one. The route holds copies of the waypoints' positions, which is what
    // the Course API navigates to, so those are used; a waypoint moved since the route was
    // made is reported with how far it has moved.
    async function routePoints(routeId) {
        const route = await app.resourcesApi.getResource('routes', routeId);
        const coordinates = route?.feature?.geometry?.coordinates || [];
        const meta = route?.feature?.properties?.coordinatesMeta || [];
        const points = [];
        for (let i = 0; i < coordinates.length; i++) {
            const [longitude, latitude] = coordinates[i];
            const position = {latitude, longitude};
            const point = {name: meta[i]?.name ?? null, position, moved: null};
            const href = meta[i]?.href;
            if (typeof href === 'string' && href.includes('/waypoints/')) {
                try {
                    const waypoint = await app.resourcesApi.getResource('waypoints', href.split('/').pop());
                    point.name = waypoint?.name ?? point.name;
                    const now = waypointToPosition(waypoint);
                    if (now) {
                        const moved = geolib.getPreciseDistance(position, now, 0.1);
                        if (moved >= 1) point.moved = moved;
                    }
                } catch (err) {
                    app.debug(`route ${routeId} waypoint ${href}: ${err}`);
                }
            }
            points.push(point);
        }
        return {name: route?.name ?? null, description: route?.description ?? null, points};
    }

    // The bearing and distance to the next point as published by others: the server's
    // Course API, or a chart plotter over NMEA (e.g. 0183 RMB/BWC, NMEA 2000 PGN 129284).
    function publishedNextPoint() {
        const read = (path) => {
            const v = app.getSelfPath(path);
            return typeof v?.value === 'number' && Number.isFinite(v.value) ? {value: v.value, source: v.$source ?? null} : null;
        };
        const result = [];
        for (const [label, prefix] of [
            ['Course API', 'navigation.course.calcValues'],
            ['Great circle', 'navigation.courseGreatCircle.nextPoint'],
            ['Rhumb line', 'navigation.courseRhumbline.nextPoint'],
        ]) {
            const bearing = read(`${prefix}.bearingTrue`);
            const distance = read(`${prefix}.distance`);
            if (bearing || distance)
                result.push({label, bearing: bearing?.value ?? null, distance: distance?.value ?? null,
                    source: bearing?.source ?? distance?.source});
        }
        return result;
    }

    // The current, as {set, drift, source}: set in radians true (the direction it flows
    // towards), drift in m/s. Either as the spec's environment.current object, or as the
    // separate paths published by e.g. signalk-derived-data's set and drift. Null if unknown.
    function currentNow() {
        const node = app.getSelfPath('environment.current');
        const number = (v) => typeof v === 'number' && Number.isFinite(v) ? v : null;
        let drift = null, set = null, source = null;
        if (node?.value && typeof node.value === 'object') {
            drift = number(node.value.drift);
            set = number(node.value.setTrue);
            source = node.$source ?? null;
        } else {
            drift = selfNumber('environment.current.drift');
            set = selfNumber('environment.current.setTrue');
            source = app.getSelfPath('environment.current.drift')?.$source ?? null;
            if (set === null) {
                const magnetic = selfNumber('environment.current.setMagnetic');
                const variation = selfNumber('navigation.magneticVariation');
                if (magnetic !== null && variation !== null)
                    set = magnetic + variation;
            }
        }
        return drift !== null && set !== null ? {set, drift, source} : null;
    }

    // Return the plugin
    return {
        id: 'signalk-racer',
        name: 'SignalK Racer',
        start: (options) => {
            if (!options.startLinePort || !options.startLineStb) {
                app.error('Missing waypoint names: startLinePort and/or startLineStb not configured.');
                return;
            }

            initRacer({
                minSog: options.minSog ?? 1.0,
                minVmg: options.minVmg ?? 0.01,
                minEffectiveVmg: (options.minEffectiveVmg ?? 0.5) * 0.514444,
                maxDistance: options.maxDistance ?? 2000,
                maxSamples: options.maxSamples ?? 600,
                maxSampleAge: (options.maxSampleAge ?? 10) * 60,
                maxPolarRatio: (options.maxPolarRatio ?? 120) / 100,
                percentile: options.percentile ?? 0.9
            }, app);

            app.debug('startLinePort:' + options.startLinePort);
            app.debug('startLineStb:' + options.startLineStb);
            app.debug('app.selfId:' + app.selfId);

            // Show the running build in the admin UI, so a stale link or a registry
            // install is obvious at a glance.
            app.setPluginStatus?.(`signalk-racer ${pluginVersion} started`);
            app.debug(`signalk-racer ${pluginVersion} loaded from ${__dirname}`);

            state.options = options;
            discoverPolars();
            state.lineActive = true;
            state.activeRouteChecked = 0;
            state.activeRouteKey = undefined;
            state.wayPointsScanned = false;
            state.timeToStart = options.timer;
            state.startLine = getStartLine();
            publishLineList();
            // Look the line up from its waypoints now, rather than waiting for a position
            // that may never come, so its ends are published either way.
            findLineAndThenProcess(undefined, true);

            // Is the timer already started
            {
                const startTime = app.getSelfPath('navigation.racing.startTime');
                if (startTime && startTime.value) {
                    state.startTime = startTime.value;
                    const now = Date.now();
                    const startAtTime = new Date(startTime.value);
                    if (startAtTime > now) {
                        state.timeToStart = secondsToStart(state.startTime, now);
                        state.timerRunning = true;
                        setTimer();
                    } else {
                        state.timeToStart = 0;
                        state.timerRunning = false;
                    }
                }
            }

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
                    let position = null;
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

                    checkActiveRoute();
                    processLaylines(position);
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
                    state.activeRouteKey = route
                        ? `${route.href}|${route.pointIndex}|${route.reverse}`
                        : null;
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
                        if (u.values) {
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
                                            putStartLineEnd('stb', v.value, ignored => {
                                            }, false).then(ignored => {
                                            });
                                            break;
                                    }
                                }
                            });
                        }
                    });
                }
            );

            // register to the standard path, so we can implement a direct put
            app.registerPutHandler('vessels.self', 'navigation.racing.startLinePort', (ctx, path, value, callback) => putStartLineEnd('port', value, callback));
            app.registerPutHandler('vessels.self', 'navigation.racing.startLineStb', (ctx, path, value, callback) => putStartLineEnd('stb', value, callback));

            // register to the best VMG paths, so they can be adjusted by a direct put
            for (const name of Object.keys(vmgNames)) {
                app.registerPutHandler('vessels.self', `navigation.racing.bestVmg.${name}`,
                    (ctx, path, value, callback) => putBestVmg(name, value, callback));
            }

            // register to API paths for this plugin
            app.registerPutHandler('vessels.self', 'navigation.racing.setStartLineName', setStartLineName);
            app.registerPutHandler('vessels.self', 'navigation.racing.setStartLine', setStartLine);
            app.registerPutHandler('vessels.self', 'navigation.racing.swapStartLine', swapStartLineEnds);
            app.registerPutHandler('vessels.self', 'navigation.racing.setStartTime', startTimeCommand);
            app.registerPutHandler('vessels.self', 'navigation.racing.setBestVmg', setBestVmgCommand);
        },

        stop: () => {
            unsubscribes.forEach((f) => f());
            unsubscribes.length = 0;
            clearTimer();
            state.startLine = null;
            state.polarService = null;
            state.rawPolar = null;
            setPolar(null);
        },

        schema: () => racerSchema,

        getOpenApi: () => require('./openapi.json'),

        // GET /plugins/signalk-racer/vmg: everything behind the best VMGs, for the
        // webapp's VMG detail page.
        registerWithRouter: (router) => {
            // GET /plugins/signalk-racer/course[?route=<id>]: a row for every point of the
            // active route, or of the route given, for the webapp's course review page.
            router.get('/course', async (req, res) => {
                try {
                    const activeRoute = await currentActiveRoute();
                    const activeId = activeRoute?.href ? activeRoute.href.split('/').pop() : null;
                    const routeId = req.query?.route || activeId;
                    const routes = await app.resourcesApi.listResources('routes', {})
                        .then(all => Object.entries(all || {}).map(([id, r]) => ({id, name: r?.name ?? id})))
                        .catch(() => []);
                    // The wind the TWAs are worked out for: the live wind, or one set on the
                    // page (?twd= in radians, ?tws= in m/s) to review the course in another.
                    const query = (name) => {
                        const value = req.query?.[name] != null && req.query[name] !== '' ? Number(req.query[name]) : NaN;
                        return Number.isFinite(value) ? value : null;
                    };
                    const liveTwd = selfNumber('environment.wind.directionTrue');
                    const liveTws = selfNumber('environment.wind.speedTrue');
                    const manualTwd = query('twd');
                    const twd = manualTwd ?? liveTwd;
                    const tws = manualTwd != null ? query('tws') : liveTws;
                    const position = app.getSelfPath('navigation.position')?.value ?? null;
                    const body = {
                        pluginVersion, routes, activeId, routeId: routeId ?? null,
                        position, twd, tws, liveTwd, liveTws,
                        nextPoint: publishedNextPoint(),
                        current: currentNow(),
                        // As published by this plugin, for the leg after the point being
                        // sailed to: they should match that leg's row.
                        nextLeg: {
                            heading: selfNumber('navigation.racing.nextLegHeading'),
                            twa: selfNumber('navigation.racing.nextLegTrueWindAngle'),
                        },
                        route: null,
                    };
                    if (routeId) {
                        const polar = activePolar();
                        const route = await routePoints(routeId);
                        const isActive = routeId === activeId;
                        const review = courseReview({
                            points: route.points,
                            reverse: isActive ? !!activeRoute.reverse : false,
                            pointIndex: isActive && Number.isInteger(activeRoute.pointIndex) ? activeRoute.pointIndex : null,
                            position: position?.latitude != null ? position : null,
                            twd,
                            beatAngle: selfNumber('performance.beatAngle'),
                            gybeAngle: selfNumber('performance.gybeAngle'),
                            // Boat speeds from the polar in the wind reviewed, for the time on
                            // each kind of leg and tack, and, with the performance factor, the
                            // VMG and ETA on each leg.
                            speedAt: polar && tws !== null ? (twa) => {
                                const speed = polar.speedAt(tws, twa);
                                return speed === null ? null : speed * polar.performanceFactor;
                            } : null,
                            tws,
                            polarAngles: polar && tws !== null ? polar.targetAngles(tws) : null,
                        });
                        const ordered = isActive && activeRoute.reverse ? [...route.points].reverse() : route.points;
                        review.rows.forEach((row, i) => { row.moved = ordered[i].moved; });
                        body.route = {name: route.name, description: route.description, active: isActive,
                            reverse: isActive ? !!activeRoute.reverse : false, ...review};
                    }
                    res.json(body);
                } catch (err) {
                    res.status(500).json({error: String(err)});
                }
            });

            // The tack and gybe angles to draw lay lines with, radians: as published, else the
            // active polar's best VMG angles in the live wind, else 45° and 135°.
            router.get('/angles', (req, res) => {
                const polar = activePolar();
                const tws = selfNumber('environment.wind.speedTrue');
                const angles = tackAngles({
                    beatAngle: selfNumber('performance.beatAngle'),
                    gybeAngle: selfNumber('performance.gybeAngle'),
                    polarAngles: polar && tws !== null ? polar.targetAngles(tws) : null,
                    speedAt: polar && tws !== null ? (twa) => polar.speedAt(tws, twa) : null,
                });
                res.json({
                    beatAngle: angles.beatAngle * Math.PI / 180,
                    gybeAngle: angles.gybeAngle * Math.PI / 180,
                    source: angles.source,
                    tws,
                });
            });

            // Display settings for the webapp, and for any other client drawing the line.
            router.get('/settings', (req, res) => {
                res.json({
                    showLaylines: state.options?.showLaylines !== false,
                    startVmgZoneAngle: startVmgZoneAngle(),
                });
            });

            router.get('/vmg', (req, res) => {
                const inputs = state.lastVmgInputs;
                const inPlay = !!state.startLine && state.distanceToLine != null;
                const detail = getVmgDetail(inputs?.cog, inputs?.sog, inputs?.lineBearing);
                // The polar ratio being sailed right now in each direction.
                for (const d of Object.values(detail.directions))
                    d.currentRatio = d.polarVmg && d.currentVmg != null ? d.currentVmg / d.polarVmg : null;
                const leg = state.lastLeg;
                res.json({
                    pluginVersion,
                    line: state.startLine ? {bearing: state.startLine.bearing, length: state.startLine.length} : null,
                    inPlay,
                    distanceToLine: state.distanceToLine ?? null,
                    legs: inPlay && leg ? {
                        awayFromLine: leg.retreat > 0 ? 'fromCourseSide' : null,
                        awayFromLineDistance: leg.retreat,
                        toLine: 'toCourseSide',
                        alongLine: leg.toZoneVz > 0 ? (leg.closestEnd === 'port' ? 'toStbEnd' : 'toPortEnd') : null,
                        toLineDistance: leg.depth,
                        alongLineDistance: leg.toZoneVz,
                    } : null,
                    startVmgZone: inPlay && leg ? {angle: leg.zoneAngle, clearance: leg.clearance} : null,
                    effectiveVmg: state.publishedEffectiveVmg,
                    inputs: inputs ?? null,
                    ...detail,
                });
            });
        },
    };
};

