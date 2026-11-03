# Signal K Racing Plugin

This plugin adds sail racing relevant data to a Signal K server. It focuses on real-time information useful during the start of a race, such as:
 + A server side race timer that can be displayed on multiple screens and be finely adjusted
 + A mechanism to set and adjust the start line using waypoints and REST commands
 + Calculation of the distance, time to line and time to burn, from the bow
 + Calculation of the TWA for the next leg of the course.

These values can be displayed in Skip/KIP widgets, Freeboard-SK, or other Signal K clients.
There are dedicated widgets for the start timer and line in Skip, and in KIP since 3.5.0.
There is also a webapp to adjust the line, visualise the approach to the line, adjust VMGs, and configure the timer.

![Skip and Freeboard Screenshot](https://raw.githubusercontent.com/gregw/signalk-racer/signalk-racer-1.3.5/images/racer-skip.png)

*Skip start line view and timer widgets beside Freeboard-SK*

---

## 🚀 Installation

Install `signalk-racer` from the Signal K server's Appstore, then enable and configure it under
Server → Plugin Config. The start line is taken from two waypoints, by default named `startBoat`
and `startPin`, which can be set from Freeboard-SK or by "pinging" the ends from the widgets.

---

## 📖 Documentation

The details are in the [wiki](https://github.com/gregw/signalk-racer/wiki):

- [Signal K Paths](https://github.com/gregw/signalk-racer/wiki/Signal-K-Paths) published by the plugin
- [Configuration](https://github.com/gregw/signalk-racer/wiki/Configuration) parameters
- [Algorithms](https://github.com/gregw/signalk-racer/wiki/Algorithms) for the line, distance, time to line and time to burn
- [Bow position](https://github.com/gregw/signalk-racer/wiki/Bow-position) and the server's GNSS (CCRP) correction
- [Webapp](https://github.com/gregw/signalk-racer/wiki/Webapp) start line visualisation
- [Skip Widgets](https://github.com/gregw/signalk-racer/wiki/Skip-Widgets)
- [API](https://github.com/gregw/signalk-racer/wiki/API) for setting the line, timer and VMGs
- [Development](https://github.com/gregw/signalk-racer/wiki/Development) and [Releasing](https://github.com/gregw/signalk-racer/wiki/Releasing)

Changes in each release are in [ReleaseNotes.md](ReleaseNotes.md).

---

## 🧪 Future Plans

- **Polars** - include polars in the effective VMG calculations
- **Laylines** and distance/time to them

---

## 📬 Feedback

Bug reports and suggestions are welcome at
[https://github.com/gregw/signalk-racer/issues](https://github.com/gregw/signalk-racer/issues)
