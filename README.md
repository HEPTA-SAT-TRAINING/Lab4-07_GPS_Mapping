# Lab4-07_GPS_Mapping

HEPTA-Sat GPS mapping for Funabashi Campus.

Open in Chrome, Edge, or Firefox (no install required). Safari is not supported.

https://hepta-sat-training.github.io/Lab4-07_GPS_Mapping/

Click Select & Change Port and choose your COM port in the browser dialog (baud rate 38400)
Read serial output in the main pane
Click Save Log to save the received GPS NMEA data as a text file
Click Disconnect when you need to release the port for other apps

## GPS status table

The map frame includes an Excel-style status table showing fix state, satellites used, satellites in view, latitude, longitude, altitude, speed, HDOP, and UTC time. Values are read from valid NMEA GGA, RMC, GSA, and GSV sentences.

## Library and map references

- [Leaflet 1.9.4](https://leafletjs.com/) for the interactive map
- [OpenStreetMap](https://www.openstreetmap.org/copyright) map tiles and attribution
- NMEA 0183 sentence parsing follows the GPS receiver output used by the HEPTA-SAT training kit
