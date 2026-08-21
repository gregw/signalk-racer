## 1.2.0 Visualize line and best VMGs
 + Added `navigation.racing.swapStartLine` to swap the port and starboard ends of the line,
   carrying the collected VMG samples across with the ends
 + Published the four best VMGs behind the time to line as `navigation.racing.bestVmg.`
   `{toCourseSide,fromCourseSide,toPortEnd,toStbEnd}`, each with an `.override` beside it
   reporting the manual adjustment, if any
 + Added `navigation.racing.setBestVmg` to adjust or reset them, plus direct puts to each path.
   An adjustment holds until the gun, but the VMG actually being sailed wins if it is better
 + Samples now keep the `cog` and `sog` that produced them, published as
   `navigation.racing.bestApproach`: the course actually sailed that best closes the line
 + Published the start line bearing as `navigation.racing.startLineBearing`
 + Webapp: swap-ends button, race countdown, and a start line visualisation with the best VMGs
   as a cross below it and projections showing where the boat reaches at the gun
 + Webapp and admin UI now show the running plugin version
 + Fixed VMG samples being rejected below an absolute 1 m/s in each direction, so a boat closing
   the line at an angle only fed the direction it was mostly travelling (now `minVmg`, 0.01 m/s)
 + Fixed the collected VMG samples being discarded whenever any waypoint changed
 + Fixed the start line bias not being cleared when the line is lost
 + Fixed the webapp race countdown never being displayed

## 1.1.2 TTL fixes
 + use a FIFO queue for VMGs towards the line.
 + avoid undefined values in deltas

## 1.1.1 Unit tests
+ split into index.js and racing.js for unit testing
+ unit tested TTL 
+ allows negative TTB
+ added configurations for VMG calculations

## 1.1.0 Named lines
+ Added Named lines support
+ Refactored distance to line calculations
+ Added timeToStart and timeToBurn (experimental at this stage)
+ Minor bug fixes

## 1.0.1 Fix initial configuration
 + Fixed default values of initial configuration

## 1.0.0 GA Release with KIP Widgets
 + Fixed bias to be towards wind

## 0.9.13 GA Release Candidate
 + handle reverse routes
 + Improve startAt date handling
 + persist timer over plugin restart

## 0.9.12 No waypoints
 + improve no waypoint handling
 + fix create waypoint

## 0.9.11 Release Candidate
 + Improved documentation

## 0.9.10 Updates for KIP widgets
 + Do not set a start time unless timer is running
 + Schema RFC 3339 units for start time.

## 0.9.9 Working with KIP prototypes
 + Fixed API handlers to use return status rather than callback

## 0.9.8
 + Minor updates to webapp UI

## 0.9.7 
 + Cleaned up webapp UI
 + reset to seconds when adjusting time

## 0.9.6 V2 API and Timer
 + Added new API V2 methods
 + Removed V1 methods
 + Webapp uses websocket
 + Server side timer 

## 0.9.5 Restructured
+ Restructured the plugin to avoid initialization problem in new server

## 0.9.4 Trivial rename
+ Renamed README.md for npmjs

## 0.9.3 KIP racer-timer integration
+ added timeToStart API

## 0.9.2 Set Start Line
+ Added API to set the start line
+ Added webapp to call start line API

## 0.9.1 Format Release
+ formating for the README.TXT

## 0.9.0 Initial Release
+ working DTL, Line Length, next TWA
