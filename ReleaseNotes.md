## 1.2.1 Start line approach
 + Fixed the distance to the start zone being measured against a 54.7 degree wedge while
   the zone itself was tested at 45 degrees, so `distanceStartline` and `timeToLine`
   jumped by 0.29 times the offset as a boat crossed the boundary. They are now continuous
   and the along-line leg reaches zero exactly at the wedge
 + The start zone geometry moved from `index.js` into `racer.js` as `startZoneDistances`,
   where it is unit tested - it had no coverage at all, which is how the above survived
 + `navigation.racing.timeToBurn` is now published when OCS as well. The time to line is
   then the time to get back over the line from the course side, so the spare time before
   you have to turn and do it is just as real, and goes negative once it is too late
 + Each effective VMG is now floored at a configurable minimum, `minEffectiveVmg`,
   defaulting to 0.5 knots. A direction with nothing collected reported no VMG at all, which
   left the time to line falling back to the time to start rather than estimating anything
 + `navigation.racing.setBestVmg` accepts `command: "clear"`, which discards the collected
   samples themselves rather than just the manual adjustments
 + Published the two VMGs the time to line is actually divided by as
   `navigation.racing.effectiveVmg.{toLine,alongLine}`: the collected best for each
   direction, or the VMG being sailed right now when that is better. `bestVmg.*` reports
   only the collected half, so a client drawing the approach from it disagreed with the
   published time whenever the boat was going well

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
