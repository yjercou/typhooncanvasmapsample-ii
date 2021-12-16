import React, { Component } from "react";
import ReactDOM from 'react-dom';
import { geoMercator, geoPath, geoGraticule10 } from "d3-geo";
import { line as d3Line, curveCatmullRom } from 'd3-shape';
import { select as d3Select, selectAll as d3SelectAll } from 'd3-selection';
import { interpolate as d3Interpolate } from 'd3-interpolate';
import { transition as d3Transition } from 'd3-transition';
import { feature, neighbors } from "topojson-client";
const parsedWeatherData = require('./parsedWeatherData.js');

class WorldMap extends Component {
  constructor() {
    super()
    const typhoonPaths = [];
    const startPoints = [];
    parsedWeatherData.forEach((pathData, i) => {
      if (i === 0) return;
      const { pastData, currData, fcstData } = pathData;
      typhoonPaths.push([...pastData, ...currData, ...fcstData]);
      startPoints.push({ name: '201701', coordinates: pastData[0].coordinates });
    });
    this.progress = {};
    this.speed = 0.7;
    this.dir = -1;
    this.invisibleSVGPath = {};
    this.renderedPath = {};
    this.lineInterval = {};
    this.radius = {};
    this.allDone = {};
    this.state = {
      worlddata: [],
      mapScaleWidth: 1200,
      cities: [
        { name: '東京', coordinates: [139.6917, 35.6895] },
        { name: '馬尼拉', coordinates: [120.9842, 14.5995] },
        { name: '曼谷', coordinates: [100.5018, 13.7563] },
        { name: '上海', coordinates: [121.4737, 31.2304] },
        { name: '福岡', coordinates: [130.4017, 33.5904] },
        { name: '胡志明市', coordinates: [106.6297, 10.8231] },
        { name: '香港', coordinates: [114.1095, 22.3964] },
        { name: '大阪', coordinates: [135.5022, 34.6937] },
      ],
      typhoonPaths,
      startPoints,
      graticule: geoGraticule10(),
    };
    this.distanceCalculate = this.distanceCalculate.bind(this);
  }

  componentDidMount() {
    fetch("https://unpkg.com/world-atlas@1/world/50m.json")
      .then(response => {
        if (response.status !== 200) {
          console.log(`There was a problem: ${response.status}`)
          return;
        }
        response.json().then(worlddata => {
          this.setState({
            worlddata: feature(worlddata, worlddata.objects.countries),
            neighbors: neighbors(worlddata.objects.countries.geometries),
          }, () => {
            this.renderMap();
            this.state.typhoonPaths.forEach((typhoonPath, idx) => {
              const canvasTyphoon = document.createElement('canvas');
              canvasTyphoon.id = `typhoonPath-canvasTyphoon-${idx}`;
              canvasTyphoon.width = 1000;
              canvasTyphoon.height = 600;
              canvasTyphoon.style.position = 'absolute';
              canvasTyphoon.style.top = 0;
              canvasTyphoon.style.left = 0;
              canvasTyphoon.style.right = 0;
              canvasTyphoon.style.margin = 'auto';
              const canvasTyphoonMarker = document.createElement('canvas');
              canvasTyphoonMarker.id = `typhoonPath-canvasTyphoonMarker-${idx}`;
              canvasTyphoonMarker.width = 1000;
              canvasTyphoonMarker.height = 600;
              canvasTyphoonMarker.style.position = 'absolute';
              canvasTyphoonMarker.style.top = 0;
              canvasTyphoonMarker.style.left = 0;
              canvasTyphoonMarker.style.right = 0;
              canvasTyphoonMarker.style.margin = 'auto';
              document.body.appendChild(canvasTyphoon);
              document.body.appendChild(canvasTyphoonMarker);
              const canvasHolder = document.getElementById(`typhoonPath-canvasTyphoon-${idx}`);
              const canvasCtx = canvasHolder.getContext('2d');
              const canvasTyphoonMarkerHolder = document.getElementById(`typhoonPath-canvasTyphoonMarker-${idx}`);
              const canvasTyphoonMarkerCtx = canvasTyphoonMarkerHolder.getContext('2d');
              this.renderLine(canvasCtx, typhoonPath, this.state.startPoints[idx], idx);
            });
          });
        })
      })
  }

  projection() {
    return geoMercator()
      .scale(1000)
      .center([122.9605, 26.6978]);
  }

  distanceCalculate(pixelLocSource, [longitude, latitude], distance) {
    // Latitude: 1 deg = 110.574 km
    // Longitude: 1 deg = 111.320*cos(latitude) km
    const lat_diff = distance / 110.574;
    const lon_distance = 111.320 * Math.cos(latitude * Math.PI / 180);
    const lon_diff = distance / lon_distance;

    const E = longitude + Math.abs(lon_diff);
    // S = latitude - Math.abs(lat_diff);
    // N = latitude + Math.abs(lat_diff);
    // W = longitude - Math.abs(lon_diff);
    const pixelLoc = this.projection()([E, latitude]);
    // distance calculate
    return Math.sqrt(Math.pow(pixelLocSource[0] - pixelLoc[0], 2) + Math.pow(pixelLocSource[1] - pixelLoc[1], 2));
  }

  timeRangeCalculate = (pathTime, range = 24) => {
    const pathDate = new Date(pathTime).getTime();
    const currDate = new Date('2017-07-27T14:00:00+08:00').getTime();
    return (pathDate - currDate) > range * 60 * 60 * 1000;
  }

  moveDash = (canvasCtx, typhoonId, typhoonPath, length, marker, frac, dir = -1) => {
    // default direction right->left
    canvasCtx.setLineDash([length]);
    canvasCtx.lineDashOffset = dir * (frac + length);
    canvasCtx.globalCompositeOperation = 'destination-over';
    canvasCtx.stroke();
    const p = this.invisibleSVGPath[typhoonId].getPointAtLength(frac);
    canvasCtx.save();
    // Move typhoon marker
    canvasCtx.beginPath();
    canvasCtx.setLineDash([0]);
    canvasCtx.lineDashOffset = 0;
    canvasCtx.lineWidth = 1;
    canvasCtx.strokeStyle = 'rgba(53, 247, 14,0.8)';
    canvasCtx.arc(p.x, p.y, 10, 0, Math.PI * 2, true);
    canvasCtx.closePath();
    canvasCtx.stroke();
  }

  defineLine(canvasCtx, typhoonPath, marker, typhoonId) {
    if (this.allDone[typhoonId]) {
      return;
    }
    // define path
    canvasCtx.beginPath();
    // start point
    const startPoint = {
      x: this.projection()(marker.coordinates)[0],
      y: this.projection()(marker.coordinates)[1],
    };
    canvasCtx.moveTo(startPoint.x, startPoint.y);
    typhoonPath.forEach((path) => {
      const x = this.projection()(path.coordinates)[0];
      const y = this.projection()(path.coordinates)[1];
      canvasCtx.lineTo(x, y);
    });
    canvasCtx.lineWidth = 2;
    canvasCtx.strokeStyle = 'rgba(17, 229, 13,0.7)';
  }

  updateLine(canvasCtx, typhoonPath, length, marker, typhoonId) {
    // define the line
    this.defineLine(canvasCtx, typhoonPath, marker, typhoonId);
    this.progress[typhoonId] = this.progress[typhoonId] || 0;
    if (this.progress[typhoonId] < length) {
      this.progress[typhoonId] += this.speed;
      this.moveDash(canvasCtx, typhoonId, typhoonPath, length, marker, this.progress[typhoonId], this.dir);
      requestAnimationFrame(this.updateLine.bind(this, canvasCtx, typhoonPath, length, marker, typhoonId));
    } else {
    
      canvasCtx.clearRect(0, 0, 1000, 600);
      this.progress[typhoonId] = 0;
      this.renderedPath = {};
      setTimeout(() => requestAnimationFrame(this.updateLine.bind(this, canvasCtx, typhoonPath, 500, marker, typhoonId)), 1000);
    }
  }

  renderMap() {
    const self = this;
    const canvasNode = d3Select('#mapCanvas').node();
    const context = canvasNode.getContext('2d');
    const path = geoPath().context(context);
    context.beginPath();
    path.projection(this.projection());
    this.state.worlddata.features.forEach((d, i) => {
      context.fillStyle = `rgba(38,50,56,${1 / this.state.worlddata.features.length * i})`
      context.beginPath();
      path(d);
      context.fill();
    });

    // add graticules path
    context.beginPath();
    path.projection(this.projection());
    path(this.state.graticule);
    context.fillStyle = 'none';
    context.strokeStyle = '#79A09E';
    context.stroke();
  }

  renderLine(canvasCtx, typhoonPath, marker, typhoonId) {
    const pathCoordinates = [];
    typhoonPath.forEach((path) => {
      pathCoordinates.push({
        x: this.projection()(path.coordinates)[0],
        y: this.projection()(path.coordinates)[1],
      });
    });
    const lineFunction = d3Line()
      .x((d) => d.x)
      .y((d) => d.y)
      .curve(curveCatmullRom);
    // use svg path to get length
    const invisiblePath = d3Select('svg')
      .append('g')
      .append('path')
      .attr('d', lineFunction(pathCoordinates))
      .attr('fill', 'none')
      .attr('stroke', 'none')
      .attr('class', 'invisiblePath');
    this.invisibleSVGPath[typhoonId] = invisiblePath.node();
    const length = this.invisibleSVGPath[typhoonId].getTotalLength();
    // this clears itself once the line is drawn
    this.radius[typhoonId] = this.distanceCalculate(marker.coordinates[0], marker.coordinates, marker.radius);
    this.lineInterval[typhoonId] = requestAnimationFrame(this.updateLine.bind(this, canvasCtx, typhoonPath, length, marker, typhoonId));
  }

  render() {
    return (
      <div>
        <svg></svg>
        <canvas
          id="mapCanvas"
          width="1000"
          height="600"
          style={{
            position: 'absolute',
            margin: '0 auto',
            right: 0,
            left: 0,
            top: 0,
            backgroundColor: '#0c6d97'
          }}
        >
          Please update your browser
        </canvas>
      </div>
    )
  }
}

export default WorldMap;


ReactDOM.render(<WorldMap />, document.getElementById('root'));
