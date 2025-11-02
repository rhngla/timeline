import React, { useEffect, useRef } from 'react';
import * as d3 from 'd3';
import rawEvents from './data.json';

const parseDate = (dateStr) => {
  const [month, year] = dateStr.split(' ');
  const monthNum = {
    Jan: 0,
    Feb: 1,
    Mar: 2,
    Apr: 3,
    May: 4,
    Jun: 5,
    Jul: 6,
    Aug: 7,
    Sep: 8,
    Oct: 9,
    Nov: 10,
    Dec: 11,
  }[month];
  return new Date(parseInt(year, 10), monthNum, 1);
};

export default function Timeline() {
  const svgRef = useRef(null);
  const pointerRef = useRef([0, 0]);
  const zoomInRef = useRef(() => {});
  const zoomOutRef = useRef(() => {});
  const resetRef = useRef(() => {});
  const transformRef = useRef(d3.zoomIdentity);

  useEffect(() => {
    const svgElement = svgRef.current;
    if (!svgElement) {
      return;
    }

    const events = rawEvents.map((event) => ({
      ...event,
      parsedDate: parseDate(event.date),
    })).sort((a, b) => a.parsedDate - b.parsedDate);

    if (events.length === 0) {
      return;
    }

    const margin = { top: 120, right: 120, bottom: 120, left: 120 };
    const height = 700;
    const innerWidth = 1400;
    const width = margin.left + innerWidth + margin.right;
    const timelineY = height / 2;

    pointerRef.current = [margin.left + innerWidth / 2, timelineY];
    transformRef.current = d3.zoomIdentity;

    const svg = d3.select(svgElement);
    svg.selectAll('*').remove();
    svg.attr('width', width).attr('height', height);

    const [minDate, maxDate] = d3.extent(events, (event) => event.parsedDate);
    if (!minDate || !maxDate) {
      return;
    }
    const timelineStart = d3.timeYear.offset(minDate, -1);
    const timelineEnd = d3.timeYear.offset(maxDate, 1);
    const baseScale = d3.scaleTime()
      .domain([timelineStart, timelineEnd])
      .range([0, innerWidth]);

    const eventsByDate = new Map();
    events.forEach((event) => {
      if (!eventsByDate.has(event.date)) {
        eventsByDate.set(event.date, []);
      }
      eventsByDate.get(event.date).push(event);
    });

    const uniqueDates = Array.from(eventsByDate.keys());
    const uniqueDateEntries = uniqueDates.map((dateStr) => ({
      dateKey: dateStr,
      parsedDate: parseDate(dateStr),
    }));

    const calculateVerticalLevels = () => {
      const positions = uniqueDateEntries.map((entry) => margin.left + baseScale(entry.parsedDate));
      const levels = [];
      const minDistance = 120;

      positions.forEach((pos, index) => {
        if (index === 0) {
          levels.push(1);
          return;
        }

        let level = 1;
        for (const tryLevel of [1, -1, 2, -2, 3, -3]) {
          let canUse = true;
          for (let j = 0; j < index; j++) {
            const distance = Math.abs(pos - positions[j]);
            if (distance < minDistance && levels[j] === tryLevel) {
              canUse = false;
              break;
            }
          }
          if (canUse) {
            level = tryLevel;
            break;
          }
        }
        levels.push(level);
      });

      return levels;
    };

    const verticalLevels = calculateVerticalLevels();

    const processedEvents = [];
    uniqueDates.forEach((dateStr, dateIndex) => {
      const dateEvents = eventsByDate.get(dateStr);
      const level = verticalLevels[dateIndex];
      const isAbove = level > 0;
      const baseLabelDistance = Math.abs(level) * 80;

      dateEvents.forEach((event, stackIndex) => {
        processedEvents.push({
          ...event,
          dateKey: dateStr,
          isAbove,
          labelDistance: baseLabelDistance + stackIndex * 100,
          stackIndex,
        });
      });
    });

    const rootGroup = svg.append('g').attr('class', 'timeline-root');

    const axisLine = rootGroup.append('line')
      .attr('class', 'timeline-axis')
      .attr('x1', margin.left)
      .attr('x2', margin.left + innerWidth)
      .attr('y1', timelineY)
      .attr('y2', timelineY)
      .attr('stroke', '#d1d5db')
      .attr('stroke-width', 3);

    const connectorsGroup = rootGroup.append('g').attr('class', 'timeline-connectors');
    const dotsGroup = rootGroup.append('g').attr('class', 'timeline-dots');
    const labelsGroup = rootGroup.append('g').attr('class', 'timeline-labels');
    const yearsGroup = rootGroup.append('g').attr('class', 'timeline-years');

    const connectorByIndex = [];
    const dotsByKey = new Map();

    const connectors = connectorsGroup.selectAll('.label-connector')
      .data(processedEvents)
      .enter()
      .append('line')
      .attr('class', 'label-connector')
      .attr('stroke', '#cbd5f5')
      .attr('stroke-width', 1.5);

    const dotGroups = dotsGroup.selectAll('.dot-group')
      .data(uniqueDateEntries)
      .enter()
      .append('g')
      .attr('class', 'dot-group');

    dotGroups.each((d, i, nodes) => {
      dotsByKey.set(d.dateKey, d3.select(nodes[i]));
    });

    dotGroups.append('circle')
      .attr('class', 'event-dot')
      .attr('r', 8)
      .attr('fill', '#f97316')
      .attr('cursor', 'pointer');

    const labelGroups = labelsGroup.selectAll('.label-group')
      .data(processedEvents)
      .enter()
      .append('g')
      .attr('class', 'label-group');

    const connectorNodes = connectors.nodes();
    connectorNodes.forEach((node, idx) => {
      connectorByIndex[idx] = d3.select(node);
    });

    const labelNodes = labelGroups.nodes();

    labelGroups.append('rect')
      .attr('class', 'label-bg')
      .attr('x', -70)
      .attr('y', (d) => (d.isAbove ? -50 : 5))
      .attr('width', 140)
      .attr('height', 45)
      .attr('rx', 10)
      .attr('fill', '#ffffff')
      .attr('stroke', '#d1d5db')
      .attr('stroke-width', 2)
      .attr('cursor', 'pointer');

    labelGroups.append('text')
      .attr('class', 'label-text')
      .attr('text-anchor', 'middle')
      .attr('y', (d) => (d.isAbove ? -32 : 22))
      .attr('font-size', '13px')
      .attr('font-weight', '600')
      .attr('fill', '#1f2937')
      .text((d) => d.label);

    labelGroups.append('text')
      .attr('class', 'date-text')
      .attr('text-anchor', 'middle')
      .attr('y', (d) => (d.isAbove ? -17 : 37))
      .attr('font-size', '11px')
      .attr('fill', '#6b7280')
      .text((d) => d.date);

    labelGroups.append('text')
      .attr('class', 'desc-text')
      .attr('text-anchor', 'middle')
      .attr('y', (d) => (d.isAbove ? -2 : 52))
      .attr('font-size', '12px')
      .attr('fill', '#374151')
      .style('opacity', 0)
      .each(function addWrappedText(d) {
        const words = d.description.split(' ');
        const lines = [];
        let currentLine = [];

        words.forEach((word) => {
          currentLine.push(word);
          if (currentLine.join(' ').length > 30) {
            lines.push(currentLine.join(' '));
            currentLine = [];
          }
        });
        if (currentLine.length > 0) {
          lines.push(currentLine.join(' '));
        }

        const textEl = d3.select(this);
        lines.forEach((line, index) => {
          textEl.append('tspan')
            .attr('x', 0)
            .attr('dy', index === 0 ? 0 : 14)
            .text(line);
        });
      });

    labelGroups.each(function configureLabelDimensions(datum) {
      const group = d3.select(this);
      const labelNode = group.select('.label-text').node();
      const dateNode = group.select('.date-text').node();
      const descNode = group.select('.desc-text').node();

      const labelBBox = labelNode ? labelNode.getBBox() : { x: -50, y: -25, width: 100, height: 20 };
      const dateBBox = dateNode ? dateNode.getBBox() : { x: -40, y: -10, width: 80, height: 18 };
      const descBBox = descNode ? descNode.getBBox() : { x: -60, y: -2, width: 120, height: 0 };

      const collapsedTop = Math.min(labelBBox.y, dateBBox.y);
      const collapsedBottom = Math.max(
        labelBBox.y + labelBBox.height,
        dateBBox.y + dateBBox.height,
      );
      const basePadding = 12;
      const baseHeight = (collapsedBottom - collapsedTop) + basePadding * 2;
      const baseY = collapsedTop - basePadding;

      const expandedTop = Math.min(collapsedTop, descBBox.y);
      const expandedBottom = Math.max(collapsedBottom, descBBox.y + descBBox.height);
      const hoverPadding = Math.max(18, basePadding + 6);
      const hoverHeight = (expandedBottom - expandedTop) + hoverPadding * 2;
      const hoverY = expandedTop - hoverPadding;

      const labelWidth = labelBBox.width;
      const dateWidth = dateBBox.width;
      const baseWidth = Math.max(140, Math.max(labelWidth, dateWidth) + 40);
      const hoverWidth = Math.max(baseWidth + 80, descBBox.width + 40, 260);

      datum.baseWidth = baseWidth;
      datum.hoverWidth = hoverWidth;
      datum.baseHeight = baseHeight;
      datum.hoverHeight = hoverHeight;
      datum.baseY = baseY;
      datum.hoverY = hoverY;

      group.select('.label-bg')
        .attr('x', -baseWidth / 2)
        .attr('width', baseWidth)
        .attr('height', baseHeight)
        .attr('y', baseY);
    });

    labelGroups
      .on('mouseenter', function handleMouseEnter(event, datum) {
        const index = labelNodes.indexOf(this);
        if (index > -1) {
          connectorByIndex[index]?.raise();
        }
        dotsByKey.get(datum.dateKey)?.raise();
        d3.select(this).raise();
        const group = d3.select(this);

        dotsByKey.get(datum.dateKey)
          ?.select('.event-dot')
          .transition()
          .duration(200)
          .attr('r', 10);

        group.select('.label-bg')
          .transition()
          .duration(200)
          .attr('x', -(datum.hoverWidth || 280) / 2)
          .attr('width', datum.hoverWidth || 280)
          .attr('height', datum.hoverHeight || 110)
          .attr('y', datum.hoverY ?? (datum.isAbove ? -115 : 5))
          .attr('stroke', '#f97316');

        group.select('.desc-text')
          .transition()
          .duration(200)
          .style('opacity', 1);
      })
      .on('mouseleave', function handleMouseLeave(event, datum) {
        const group = d3.select(this);

        dotsByKey.get(datum.dateKey)
          ?.select('.event-dot')
          .transition()
          .duration(200)
          .attr('r', 8);

        group.select('.label-bg')
          .transition()
          .duration(200)
          .attr('x', -(datum.baseWidth || 140) / 2)
          .attr('width', datum.baseWidth || 140)
          .attr('height', datum.baseHeight || 45)
          .attr('y', datum.baseY ?? (datum.isAbove ? -50 : 5))
          .attr('stroke', '#d1d5db');

        group.select('.desc-text')
          .transition()
          .duration(200)
          .style('opacity', 0);
      });

    const yearTicks = d3.timeYear.range(
      timelineStart,
      d3.timeYear.offset(timelineEnd, 1),
      5,
    );

    const yearMarkers = yearsGroup.selectAll('.year-marker')
      .data(yearTicks)
      .enter()
      .append('g')
      .attr('class', 'year-marker');

    yearMarkers.append('line')
      .attr('y1', timelineY - 6)
      .attr('y2', timelineY + 6)
      .attr('stroke', '#9ca3af')
      .attr('stroke-width', 1.5);

    yearMarkers.append('text')
      .attr('y', timelineY + 26)
      .attr('text-anchor', 'middle')
      .attr('fill', '#6b7280')
      .attr('font-weight', '600')
      .attr('font-size', '13px')
      .text((d) => d.getFullYear());

    const render = (transform = transformRef.current) => {
      const zoomTransform = transform || d3.zoomIdentity;
      const currentScale = zoomTransform.rescaleX(baseScale);

      const positionX = (date) => margin.left + currentScale(date);
      const labelY = (event) => (event.isAbove
        ? timelineY - (event.labelDistance + 20)
        : timelineY + (event.labelDistance + 20));

      axisLine
        .attr('x1', positionX(timelineStart))
        .attr('x2', positionX(timelineEnd));

      connectors
        .attr('x1', (d) => positionX(d.parsedDate))
        .attr('x2', (d) => positionX(d.parsedDate))
        .attr('y1', timelineY)
        .attr('y2', (d) => labelY(d));

      dotGroups
        .attr('transform', (d) => `translate(${positionX(d.parsedDate)}, ${timelineY})`);

      labelGroups
        .attr('transform', (d) => `translate(${positionX(d.parsedDate)}, ${labelY(d)})`);

      yearMarkers
        .attr('transform', (d) => `translate(${positionX(d)}, 0)`);
    };

    render(d3.zoomIdentity);

    const zoomBehavior = d3.zoom()
      .scaleExtent([0.5, 12])
      .translateExtent([[margin.left - innerWidth, 0], [margin.left + innerWidth * 2, height]])
      .on('zoom', (event) => {
        transformRef.current = event.transform;
        render(event.transform);
      });

    svg.call(zoomBehavior);

    const zoomBy = (factor) => {
      const point = pointerRef.current || [margin.left + innerWidth / 2, timelineY];
      svg.transition()
        .duration(300)
        .call(zoomBehavior.scaleBy, factor, point);
    };

    zoomInRef.current = () => zoomBy(1.4);
    zoomOutRef.current = () => zoomBy(1 / 1.4);
    resetRef.current = () => {
      svg.transition()
        .duration(400)
        .call(zoomBehavior.transform, d3.zoomIdentity);
    };

    svg.on('mousemove', (event) => {
      pointerRef.current = d3.pointer(event, svg.node());
    });

    svg.on('mouseleave', () => {
      pointerRef.current = [margin.left + innerWidth / 2, timelineY];
    });

    return () => {
      svg.on('.zoom', null);
      svg.on('mousemove', null);
      svg.on('mouseleave', null);
      zoomInRef.current = () => {};
      zoomOutRef.current = () => {};
      resetRef.current = () => {};
    };
  }, []);

  const handleZoomIn = () => {
    zoomInRef.current();
  };

  const handleZoomOut = () => {
    zoomOutRef.current();
  };

  const handleReset = () => {
    resetRef.current();
  };

  return (
    <div className="app-shell">
      <div className="timeline-wrapper">
        <div className="zoom-controls" aria-label="Timeline zoom controls">
          <button type="button" className="zoom-button" onClick={handleZoomIn} aria-label="Zoom in">
            +
          </button>
          <button type="button" className="zoom-button" onClick={handleZoomOut} aria-label="Zoom out">
            -
          </button>
          <button type="button" className="zoom-button reset" onClick={handleReset}>
            Reset
          </button>
        </div>
        <div className="timeline-scroll">
          <svg ref={svgRef} />
        </div>
      </div>
    </div>
  );
}
