# Signal K Racing Plugin

This plugin adds sail racing relevant data to a Signal K server. It focuses on real-time information useful during the start of a race, such as:
 + A server side race timer that can be displayed on multiple screens and be finely adjusted
 + A mechanism to set and adjust the start line using waypoints and REST commands
 + Calculation of the distance to the line.
 + Calculation of the TWA for the next leg of the course.

GitHub repository: [https://github.com/gregw/signalk-racer](https://github.com/gregw/signalk-racer)

---

## 📌 Features

This plugin calculates and publishes the following Signal K paths:

| Path                                            | Description                                            | Units                  | Std |
|-------------------------------------------------|--------------------------------------------------------|------------------------|-----|
| `navigation.racing.`<br/>`distanceStartline`    | Signed minimum distance from the bow to the start line | `m`                    | Y   |
| `navigation.racing.`<br/>`startLineLength`      | Total length of the start line                         | `m`                    |     |
| `navigation.racing.`<br/>`stbLineBias`          | Bias of the start line toward the starboard end        | `m`                    |     |
| `navigation.racing.`<br/>`startLinePort`        | Location of the port (pin) end of the start line       | `{latitude,longitude}` | Y   |
| `navigation.racing.`<br/>`startLineStb`         | Location of the starboard (boat) end of the start line | `{latitude,longitude}` | Y   |
| `navigation.racing.`<br/>`nextLegHeading`       | True heading for the next leg of the course            | `rad`                  |     |
| `navigation.racing.`<br/>`nextLegTrueWindAngle` | True Wind Angle for the next leg of the course         | `rad`                  |     |
| `navigation.racing.`<br/>`timeToStart`          | Period of time until the race start                    | `s`                    | Y   |
| `navigation.racing.`<br/>`startTime`            | The start time as an ISO timestamp                     | `rfc3339`              |     |

These values can be displayed in KIP widgets, Freeboard-SK, or other Signal K clients.  
There are dedicated widgets for the start timer and line adjustment since 3.5.0 of KIP 

![KIP and Freeboard Screenshot](racer-kip.png)

There is also a webapp to adjust the line and timer.

![Signalk Racer Webapp](racer-webapp.png)

---

## ⚙️ Configuration

You can configure the plugin via the Signal K web interface or by editing `settings.json` manually.

### Parameters:

| Parameter                 | Description                                                             | Default       |
|---------------------------|-------------------------------------------------------------------------|---------------|
| `startLineStb`            | Name of the waypoint for the starboard (committee boat) end of the line | `"startBoat"` |
| `startLinePort`           | Name of the waypoint for the port (pin) end of the line                 | `"startPin"`  |
| `timer`                   | Initial time for the race timer (in seconds)                            | `300`         |
| `period`                  | How often to update values (in milliseconds)                            | `1000`        |
| `updateStartLineWaypoint` | Should the waypoints be updated if the line is set/adjusted             | `true`        |
| `createStartLineWaypoint` | Should the waypoints be created if the line is set                      | `true`        |

---

## 🧠 Algorithm Descriptions

### Waypoint selection (`navigation.racing.startLinePort` and `navigation.racing.startLineStb`)

The `startLineStb` and `startLinePort` configurations are used to search resources for matching waypoints. These waypoints can be modified in real time (e.g. moving or setting in Freeboard SK) and the algorithm with update to the new line.

### Bow position

If `navigation.headingTrue` is not available, then `navigation.courseOverGroundTrue` is used when determining the position of the bow relative to the GPS position.

### Distance to Start Line (`navigation.racing.distanceStartline`)

- Computes the **signed minimum distance** from the **bow** of the boat to the configured start line.
- Uses `sensors.gps.fromBow` and `sensors.gps.fromCenter` offsets to calculate the actual bow position.
- Normally uses the **perpendicular projection** from the bow to the line.
- However, if the bow is located within a **45° sector** off either end of the line, the plugin adds the distance back to that diagonal to perpendicular distance.
- The result is:
    - **Negative** when the bow is **over the line (OCS)**
    - **Positive** when the bow is **behind the line**

### Start Line Bias (`navigation.racing.stbLineBias`)

- Measures how far ahead (downwind) the **pin** end is relative to the **boat** end.
- The `environment.wind.directionTrue` is used as well as the calculated line length and bearing.
- A **positive value** means the **pin end is more downwind**, implying the **starboard (boat) end is favored** for upwind starts.

### Line Coordinates & Length

- The plugin reads Signal K `waypoints` resources for the names you configure.
- If both endpoints are found, it calculates:
- Line length (using `geolib.getPreciseDistance`)
- Line bearing (rhumb line from starboard to port)

### Next Leg
- If a course is active then the true bearing for the next leg is calculated as `navigation.racing.nextLegHeading`
- If the `environment.wind.directionTrue` is available, then the True Wind Angle for the next leg is also calculated as `navigation.racing.nextLegTrueWindAngle`
- If the next mark of the active route is beyond the first mark, then the start line calculations are suspended.

---

## 🌐 API Access

This plugin uses the following WebSocket-based PUT requests to Signal K model paths.

### `navigation.racing.setStartLine`

Used to **set** or **adjust** either end of the start line.

#### Payload:
```
{
  "end": "port" | "stb",             
  "position": "bow" | { "latitude": ..., "longitude": ... },  
  "delta": 10,                       
  "rotate": 0.1                      
}
```

- `end`: which end to modify.
- `position`: `"bow"` or `{ latitude, longitude }`.
- `delta`: distance in meters along bearing.
- `rotate`: angle in radians.

---

### `navigation.racing.setStartTime`

Used to **start**, **sync**, **reset**, or **set a fixed start time**.

#### Payload:
```
{
  "command": "start" | "reset" | "sync" | "adjust" | "set",
  "delta": 30,
  "startTime": "2025-06-18T04:15:00Z"
}
```
---

## 🧩 KIP Widgets
KIP components for `racer-timer` and `racer-line` have been developed and are available from release 3.5.0 of KIP.

## 🔄 Dependencies

### Plugins
- [KIP >= 3.5.0](https://github.com/mxtommy/Kip) for graphic widget support
- [FreeboardSK](https://github.com/SignalK/freeboard-sk#readme) for graphic display of the start line
- [resources-provider](https://www.npmjs.com/package/@signalk/resources-provider) plugin with waypoints enabled
- [course-provider](https://www.npmjs.com/package/@signalk/course-provider) plugin to enable the next leg calculations

### Libraries
- `geolib`: for distance and bearing calculations.

---

## 🧪 Future Plans

- Add calculations for:
- **Time to line** (using STW and heading or polar speeds)
- **Laylines** and distance/time to them

--- 
## 📬 Feedback

Bug reports and suggestions are welcome at  
[https://github.com/gregw/signalk-racer](https://github.com/gregw/signalk-racer)
