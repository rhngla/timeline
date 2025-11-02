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
    const minHeight = 700;
    const innerWidth = 1400;
    const width = margin.left + innerWidth + margin.right;

    const [minDate, maxDate] = d3.extent(events, (event) => event.parsedDate);
    if (!minDate || !maxDate) {
      return;
    }
    const timelineStart = d3.timeYear.offset(minDate, -1);
    const timelineEnd = d3.timeYear.offset(maxDate, 1);
    const baseScale = d3.scaleTime()
      .domain([timelineStart, timelineEnd])
      .range([0, innerWidth]);

    const monthFormat = d3.timeFormat('%b');

    const eventsByYear = d3.groups(events, (event) => event.parsedDate.getFullYear());
    const yearEntries = eventsByYear.map(([year, yearEvents]) => ({
      year,
      parsedYearDate: new Date(year, 0, 1),
      events: yearEvents.sort((a, b) => a.parsedDate - b.parsedDate),
    }));

    const calculateVerticalLevels = () => {
      const positions = yearEntries.map((entry) => margin.left + baseScale(entry.parsedYearDate));
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

    const stackSpacing = 80;
    const itemHeight = 56;
    const baseItemWidth = 220;
    const expandedItemWidth = 400;
    const baseOffset = 140;
    const levelOffset = 70;
    const stackLinkOffset = 0;
    const stackCardOffset = 14;

    const processedYears = yearEntries.map((entry, index) => {
      const level = verticalLevels[index] ?? 1;
      const isAbove = level >= 0;
      const stackOffset = baseOffset + Math.max(0, Math.abs(level) - 1) * levelOffset;
      const processedEvents = entry.events.map((event, stackIndex) => {
        const stackY = stackIndex * stackSpacing;
        return {
          ...event,
          yearKey: entry.year,
          stackIndex,
          isAbove,
          baseWidth: baseItemWidth,
          expandedWidth: expandedItemWidth,
          itemHeight,
          stackSpacing,
          stackOffset,
          stackY,
          centerY: stackY + itemHeight / 2,
          monthLabel: monthFormat(event.parsedDate),
        };
      });
      const totalHeight = processedEvents.length > 0
        ? ((processedEvents.length - 1) * stackSpacing) + itemHeight
        : 0;
      const firstConnectorOffset = processedEvents[0]?.centerY ?? 0;
      const lastConnectorOffset = processedEvents.length > 0
        ? processedEvents[processedEvents.length - 1]?.centerY ?? 0
        : 0;
      return {
        ...entry,
        level,
        isAbove,
        stackOffset,
        stackSpacing,
        totalHeight,
        itemHeight,
        firstConnectorOffset,
        lastConnectorOffset,
        events: processedEvents,
      };
    });

    const aboveDepth = d3.max(processedYears
      .filter((year) => year.isAbove)
      .map((year) => year.stackOffset + year.totalHeight)) ?? (baseOffset + itemHeight);
    const belowDepth = d3.max(processedYears
      .filter((year) => !year.isAbove)
      .map((year) => year.stackOffset + year.totalHeight)) ?? (baseOffset + itemHeight);

    const computedTimelineY = margin.top + aboveDepth;
    const computedHeight = computedTimelineY + belowDepth + margin.bottom;
    const height = Math.max(minHeight, computedHeight);
    const extraSpace = height - computedHeight;
    const timelineY = computedTimelineY + (extraSpace / 2);

    pointerRef.current = [margin.left + innerWidth / 2, timelineY];
    transformRef.current = d3.zoomIdentity;

    const svg = d3.select(svgElement);
    svg.selectAll('*').remove();
    svg.attr('width', width).attr('height', height);

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
    const stacksGroup = rootGroup.append('g').attr('class', 'timeline-stacks');
    const yearsGroup = rootGroup.append('g').attr('class', 'timeline-years');

    const connectorByYear = new Map();
    const dotsByYear = new Map();

    const connectors = connectorsGroup.selectAll('.year-connector')
      .data(processedYears)
      .enter()
      .append('line')
      .attr('class', 'year-connector')
      .attr('stroke', '#cbd5f5')
      .attr('stroke-width', 1.5)
      .attr('stroke-dasharray', '6 4');

    connectors.each((d, i, nodes) => {
      connectorByYear.set(d.year, d3.select(nodes[i]));
    });

    const dotGroups = dotsGroup.selectAll('.dot-group')
      .data(processedYears)
      .enter()
      .append('g')
      .attr('class', 'dot-group');

    dotGroups.each((d, i, nodes) => {
      dotsByYear.set(d.year, d3.select(nodes[i]));
    });

    dotGroups.append('circle')
      .attr('class', 'event-dot')
      .attr('r', 8)
      .attr('fill', '#f97316')
      .attr('cursor', 'pointer');

    const stackGroups = stacksGroup.selectAll('.stack-group')
      .data(processedYears)
      .enter()
      .append('g')
      .attr('class', 'stack-group');

    const stackItems = stackGroups.selectAll('.stack-item')
      .data((d) => d.events)
      .enter()
      .append('g')
      .attr('class', 'stack-item')
      .attr('cursor', 'pointer');

    stackItems.attr('transform', (d) => `translate(0, ${d.stackY})`);

    stackItems.append('rect')
      .attr('class', 'stack-bg')
      .attr('x', stackCardOffset)
      .attr('y', 0)
      .attr('width', (d) => d.baseWidth)
      .attr('height', (d) => d.itemHeight)
      .attr('rx', 12)
      .attr('fill', '#ffffff')
      .attr('stroke', '#d1d5db')
      .attr('stroke-width', 2);

    stackItems.append('text')
      .attr('class', 'stack-label')
      .attr('text-anchor', 'start')
      .attr('x', stackCardOffset + 16)
      .attr('y', 24)
      .attr('font-size', '13px')
      .attr('font-weight', '600')
      .attr('fill', '#1f2937')
      .text((d) => d.label);

    stackItems.append('text')
      .attr('class', 'stack-month')
      .attr('text-anchor', 'start')
      .attr('x', stackCardOffset + 16)
      .attr('y', (d) => d.itemHeight - 12)
      .attr('font-size', '11px')
      .attr('fill', '#6b7280')
      .text((d) => `${d.monthLabel} ${d.parsedDate.getFullYear()}`);

    stackItems.append('text')
      .attr('class', 'stack-desc')
      .attr('text-anchor', 'start')
      .attr('x', 0)
      .attr('y', 22)
      .attr('font-size', '12px')
      .attr('fill', '#374151')
      .style('opacity', 0)
      .style('pointer-events', 'none')
      .each(function wrapDescription(d) {
        const textEl = d3.select(this);
        const words = d.description.split(' ');
        const lines = [];
        let currentLine = [];
        const maxChars = 32;

        words.forEach((word) => {
          currentLine.push(word);
          if (currentLine.join(' ').length > maxChars) {
            lines.push(currentLine.join(' '));
            currentLine = [];
          }
        });
        if (currentLine.length > 0) {
          lines.push(currentLine.join(' '));
        }

        const descX = stackCardOffset + d.baseWidth + 24;
        lines.forEach((line, index) => {
          textEl.append('tspan')
            .attr('x', descX)
            .attr('dy', index === 0 ? 0 : 16)
            .text(line);
        });
      });

    stackItems.each(function adjustStackDimensions(datum) {
      const group = d3.select(this);
      const rect = group.select('.stack-bg');
      const labelNode = group.select('.stack-label').node();
      const monthNode = group.select('.stack-month').node();
      const descNode = group.select('.stack-desc').node();

      const labelWidth = labelNode ? labelNode.getBBox().width : 0;
      const monthWidth = monthNode ? monthNode.getBBox().width : 0;
      const descBBox = descNode ? descNode.getBBox() : { width: 0, height: 0 };

      const contentWidth = Math.max(labelWidth, monthWidth);
      const baseWidth = Math.max(baseItemWidth, contentWidth + 32);
      const descWidth = descBBox.width;
      const expandedWidth = Math.max(expandedItemWidth, baseWidth + descWidth + 40);
      const descOffset = stackCardOffset + baseWidth + 24;

      datum.baseWidth = baseWidth;
      datum.expandedWidth = expandedWidth;
      datum.descOffset = descOffset;

      rect
        .attr('x', stackCardOffset)
        .attr('width', baseWidth);

      group.select('.stack-desc')
        .attr('x', descOffset)
        .selectAll('tspan')
        .attr('x', descOffset);
    });

    stackGroups
      .filter((d) => d.events.length > 1)
      .append('line')
      .attr('class', 'stack-rail')
      .attr('x1', stackLinkOffset)
      .attr('x2', stackLinkOffset)
      .attr('y1', 0)
      .attr('y2', (d) => Math.max(0, d.totalHeight))
      .attr('stroke', '#cbd5f5')
      .attr('stroke-width', 1.5)
      .attr('stroke-dasharray', '4 3')
      .lower();

    stackGroups.selectAll('.stack-hook')
      .data((d) => d.events.map((event) => ({
        yearKey: d.year,
        y: event.stackY + event.itemHeight / 2,
      })))
      .enter()
      .append('line')
      .attr('class', 'stack-hook')
      .attr('x1', stackLinkOffset)
      .attr('x2', stackCardOffset)
      .attr('y1', (seg) => seg.y)
      .attr('y2', (seg) => seg.y)
      .attr('stroke', '#cbd5f5')
      .attr('stroke-width', 1.5)
      .attr('stroke-dasharray', '4 3')
      .lower();

    const setConnectorStroke = (year, strokeValue, duration = 200) => {
      const line = connectorByYear.get(year);
      if (!line) {
        return;
      }
      line
        .transition()
        .duration(duration)
        .attr('stroke', strokeValue);
    };

    stackItems
      .on('mouseenter', function handleMouseEnter(event, datum) {
        connectorByYear.get(datum.yearKey)?.raise();
        dotsByYear.get(datum.yearKey)?.raise();
        d3.select(this.parentNode).raise();

        dotsByYear.get(datum.yearKey)
          ?.select('.event-dot')
          .transition()
          .duration(200)
          .attr('r', 10);

        setConnectorStroke(datum.yearKey, '#94a3d8');

        d3.select(this.parentNode)
          .selectAll('.stack-rail, .stack-hook')
          .transition()
          .duration(200)
          .attr('stroke', '#94a3d8');

        const group = d3.select(this);
        const rect = group.select('.stack-bg');
        const desc = group.select('.stack-desc');

        rect
          .transition()
          .duration(200)
          .attr('width', datum.expandedWidth)
          .attr('stroke', '#f97316');

        desc
          .transition()
          .duration(200)
          .style('opacity', 1);

        desc.selectAll('tspan')
          .attr('x', datum.descOffset);
      })
      .on('mouseleave', function handleMouseLeave(event, datum) {
        const group = d3.select(this);
        const rect = group.select('.stack-bg');
        const desc = group.select('.stack-desc');

        dotsByYear.get(datum.yearKey)
          ?.select('.event-dot')
          .transition()
          .duration(200)
          .attr('r', 8);

        setConnectorStroke(datum.yearKey, '#cbd5f5');

        d3.select(this.parentNode)
          .selectAll('.stack-rail, .stack-hook')
          .transition()
          .duration(200)
          .attr('stroke', '#cbd5f5');

        rect
          .transition()
          .duration(200)
          .attr('width', datum.baseWidth)
          .attr('stroke', '#d1d5db');

        desc
          .transition()
          .duration(200)
          .style('opacity', 0);

        desc.selectAll('tspan')
          .attr('x', datum.descOffset);
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
      const stackTopY = (yearData) => {
        if (yearData.isAbove) {
          return timelineY - yearData.stackOffset - yearData.totalHeight;
        }
        return timelineY + yearData.stackOffset;
      };
      const stackAnchorX = (yearData) => positionX(yearData.parsedYearDate);
      const connectorEndY = (yearData) => {
        if (yearData.events.length === 0) {
          return timelineY;
        }
        if (yearData.isAbove) {
          return stackTopY(yearData) + (yearData.firstConnectorOffset ?? 0);
        }
        return stackTopY(yearData) + (yearData.lastConnectorOffset ?? 0);
      };

      axisLine
        .attr('x1', positionX(timelineStart))
        .attr('x2', positionX(timelineEnd));

      connectors
        .attr('x1', (d) => positionX(d.parsedYearDate))
        .attr('x2', (d) => positionX(d.parsedYearDate))
        .attr('y1', timelineY)
        .attr('y2', (d) => connectorEndY(d));

      dotGroups
        .attr('transform', (d) => `translate(${positionX(d.parsedYearDate)}, ${timelineY})`);

      stackGroups
        .attr('transform', (d) => `translate(${stackAnchorX(d)}, ${stackTopY(d)})`);

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
