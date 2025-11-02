import React, { useEffect, useRef } from 'react';
import * as d3 from 'd3';
import rawEvents from './data.json';

const MONTH_INDEX = {
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
};

const layoutConfig = {
  margin: { top: 120, right: 120, bottom: 120, left: 120 },
  innerWidth: 1400,
  minHeight: 700,
  lanes: {
    minSpacing: 120,
    baseOffset: 140,
    levelOffset: 70,
  },
  stack: {
    spacing: 80,
    itemHeight: 56,
    baseWidth: 220,
    minExpandedWidth: 420,
    cardOffset: 14,
    linkOffset: 0,
  },
  description: {
    gap: 24,
    maxWidth: 280,
    lineHeight: 16,
  },
  dot: {
    baseRadius: 8,
    highlightRadius: 10,
  },
  colors: {
    axis: '#d1d5db',
    connector: '#cbd5f5',
    connectorHighlight: '#94a3d8',
    dot: '#f97316',
    cardStroke: '#d1d5db',
    cardStrokeActive: '#f97316',
    stackRail: '#cbd5f5',
  },
  zoom: {
    scaleStep: 1.4,
    min: 0.5,
    max: 12,
    duration: 300,
    resetDuration: 400,
  },
  yearMarkers: {
    step: 5,
    tickSize: 6,
    labelOffset: 26,
  },
  transition: {
    fast: 200,
  },
};

const parseDate = (value) => {
  if (!value) {
    return null;
  }
  const trimmed = String(value).trim();
  if (!trimmed) {
    return null;
  }

  const [rawMonth, rawYear] = trimmed.split(/\s+/);
  const monthKey = rawMonth?.slice(0, 3);
  const month = MONTH_INDEX[rawMonth] ?? MONTH_INDEX[monthKey];
  const year = Number.parseInt(rawYear, 10);

  if (Number.isInteger(month) && Number.isInteger(year)) {
    const candidate = new Date(year, month, 1);
    if (!Number.isNaN(candidate.getTime())) {
      return candidate;
    }
  }

  const fallback = new Date(trimmed);
  if (!Number.isNaN(fallback.getTime())) {
    fallback.setDate(1);
    return fallback;
  }

  return null;
};

const sanitizeDescription = (value) => {
  if (typeof value !== 'string') {
    return '';
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : '';
};

const calculateVerticalLevels = (entries, getPosition, minSpacing) => {
  const assigned = [];
  const positions = entries.map((entry) => getPosition(entry));

  entries.forEach((_, index) => {
    if (index === 0) {
      assigned.push(1);
      return;
    }

    const usedLevels = new Set();
    for (let j = 0; j < index; j += 1) {
      if (Math.abs(positions[index] - positions[j]) < minSpacing) {
        usedLevels.add(assigned[j]);
      }
    }

    let magnitude = 1;
    let chosenLevel = 1;
    const safetyLimit = entries.length + 10;
    while (magnitude < safetyLimit) {
      const candidates = [magnitude, -magnitude];
      let found = false;
      for (const candidate of candidates) {
        if (!usedLevels.has(candidate)) {
          chosenLevel = candidate;
          found = true;
          break;
        }
      }
      if (found) {
        break;
      }
      magnitude += 1;
    }

    if (usedLevels.has(chosenLevel)) {
      chosenLevel = 0;
    }

    assigned.push(chosenLevel === 0 ? 1 : chosenLevel);
  });

  return assigned;
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

    const events = rawEvents
      .map((event) => {
        const parsedDate = parseDate(event.date);
        if (!parsedDate) {
          return null;
        }
        return {
          ...event,
          parsedDate,
          description: sanitizeDescription(event.description),
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.parsedDate - b.parsedDate);

    if (events.length === 0) {
      return;
    }

    const { margin, innerWidth, minHeight } = layoutConfig;
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

    const verticalLevels = calculateVerticalLevels(
      yearEntries,
      (entry) => margin.left + baseScale(entry.parsedYearDate),
      layoutConfig.lanes.minSpacing,
    );

    const processedYears = yearEntries.map((entry, index) => {
      const level = verticalLevels[index] ?? 1;
      const isAbove = level >= 0;
      const stackOffset = layoutConfig.lanes.baseOffset
        + Math.max(0, Math.abs(level) - 1) * layoutConfig.lanes.levelOffset;

      const processedEvents = entry.events.map((event, stackIndex) => {
        const stackY = stackIndex * layoutConfig.stack.spacing;
        return {
          ...event,
          description: event.description,
          yearKey: entry.year,
          stackIndex,
          isAbove,
          baseWidth: layoutConfig.stack.baseWidth,
          expandedWidth: layoutConfig.stack.minExpandedWidth,
          itemHeight: layoutConfig.stack.itemHeight,
          stackSpacing: layoutConfig.stack.spacing,
          stackOffset,
          stackY,
          centerY: stackY + layoutConfig.stack.itemHeight / 2,
          topY: stackY,
          bottomY: stackY + layoutConfig.stack.itemHeight,
          monthLabel: monthFormat(event.parsedDate),
        };
      });

      const totalHeight = processedEvents.length > 0
        ? ((processedEvents.length - 1) * layoutConfig.stack.spacing) + layoutConfig.stack.itemHeight
        : 0;
      const connectorTop = processedEvents[0]?.topY ?? 0;
      const connectorBottom = processedEvents.length > 0
        ? processedEvents[processedEvents.length - 1]?.bottomY ?? 0
        : 0;

      return {
        ...entry,
        level,
        isAbove,
        stackOffset,
        totalHeight,
        connectorTop,
        connectorBottom,
        events: processedEvents,
      };
    });

    const aboveDepth = d3.max(processedYears
      .filter((year) => year.isAbove)
      .map((year) => year.stackOffset + year.totalHeight)) ?? (layoutConfig.lanes.baseOffset + layoutConfig.stack.itemHeight);
    const belowDepth = d3.max(processedYears
      .filter((year) => !year.isAbove)
      .map((year) => year.stackOffset + year.totalHeight)) ?? (layoutConfig.lanes.baseOffset + layoutConfig.stack.itemHeight);

    const computedTimelineY = margin.top + aboveDepth;
    const computedHeight = computedTimelineY + belowDepth + margin.bottom;
    const height = Math.max(minHeight, computedHeight);
    const extraSpace = Math.max(0, height - computedHeight);
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
      .attr('stroke', layoutConfig.colors.axis)
      .attr('stroke-width', 3);

    const connectorsGroup = rootGroup.append('g').attr('class', 'timeline-connectors');
    const dotsGroup = rootGroup.append('g').attr('class', 'timeline-dots');
    const stacksGroup = rootGroup.append('g').attr('class', 'timeline-stacks');
    const yearsGroup = rootGroup.append('g').attr('class', 'timeline-years');

    const connectorByYear = new Map();
    const dotsByYear = new Map();
    const stackGroupByYear = new Map();
    const activeHighlightCounts = new Map();

    const connectors = connectorsGroup.selectAll('.year-connector')
      .data(processedYears)
      .enter()
      .append('line')
      .attr('class', 'year-connector')
      .attr('stroke', layoutConfig.colors.connector)
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
      .attr('r', layoutConfig.dot.baseRadius)
      .attr('fill', layoutConfig.colors.dot)
      .attr('cursor', 'pointer');

    const stackGroups = stacksGroup.selectAll('.stack-group')
      .data(processedYears)
      .enter()
      .append('g')
      .attr('class', 'stack-group');

    stackGroups.each((d, i, nodes) => {
      stackGroupByYear.set(d.year, d3.select(nodes[i]));
    });

    const stackItems = stackGroups.selectAll('.stack-item')
      .data((d) => d.events)
      .enter()
      .append('g')
      .attr('class', 'stack-item')
      .attr('cursor', 'pointer')
      .attr('transform', (d) => `translate(0, ${d.stackY})`);

    stackItems.append('rect')
      .attr('class', 'stack-bg')
      .attr('x', layoutConfig.stack.cardOffset)
      .attr('y', 0)
      .attr('width', (d) => d.baseWidth)
      .attr('height', (d) => d.itemHeight)
      .attr('rx', 12)
      .attr('fill', '#ffffff')
      .attr('stroke', layoutConfig.colors.cardStroke)
      .attr('stroke-width', 2);

    stackItems.append('text')
      .attr('class', 'stack-label')
      .attr('text-anchor', 'start')
      .attr('x', layoutConfig.stack.cardOffset + 16)
      .attr('y', 24)
      .attr('font-size', '13px')
      .attr('font-weight', '600')
      .attr('fill', '#1f2937')
      .text((d) => d.label);

    stackItems.append('text')
      .attr('class', 'stack-month')
      .attr('text-anchor', 'start')
      .attr('x', layoutConfig.stack.cardOffset + 16)
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
        const description = d.description;

        if (!description) {
          textEl.text('');
          textEl.classed('has-content', false);
          return;
        }

        textEl.text('');
        textEl.classed('has-content', true);
        const words = description.split(/\s+/);
        const maxWidth = layoutConfig.description.maxWidth;
        const lineHeight = layoutConfig.description.lineHeight;

        let lineWords = [];
        let tspan = textEl.append('tspan').attr('dy', 0);

        words.forEach((word, wordIndex) => {
          if (!word) {
            return;
          }
          const currentWords = [...lineWords, word];
          tspan.text(currentWords.join(' '));

          const textLength = tspan.node().getComputedTextLength();
          if (textLength <= maxWidth || lineWords.length === 0) {
            lineWords = currentWords;
            return;
          }

          tspan.text(lineWords.join(' '));
          lineWords = [word];
          tspan = textEl.append('tspan')
            .attr('dy', lineHeight)
            .text(word);

          if (wordIndex === words.length - 1 && tspan.node().getComputedTextLength() > maxWidth) {
            tspan.text(word.slice(0, Math.max(3, Math.floor(maxWidth / 6))));
          }
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
      const contentWidth = Math.max(labelWidth, monthWidth);
      const baseWidth = Math.max(layoutConfig.stack.baseWidth, contentWidth + 32);

      let descWidth = 0;
      if (descNode && descNode.textContent.trim().length > 0) {
        const descBox = descNode.getBBox();
        descWidth = Math.min(descBox.width, layoutConfig.description.maxWidth);
      }

      const descOffset = layoutConfig.stack.cardOffset + baseWidth + layoutConfig.description.gap;
      const expandedWidth = Math.max(
        layoutConfig.stack.minExpandedWidth,
        baseWidth + (descWidth > 0 ? layoutConfig.description.gap + descWidth : 0),
      );

      datum.baseWidth = baseWidth;
      datum.expandedWidth = expandedWidth;
      datum.descOffset = descOffset;

      rect
        .attr('x', layoutConfig.stack.cardOffset)
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
      .attr('x1', layoutConfig.stack.linkOffset)
      .attr('x2', layoutConfig.stack.linkOffset)
      .attr('y1', 0)
      .attr('y2', (d) => Math.max(0, d.totalHeight))
      .attr('stroke', layoutConfig.colors.stackRail)
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
      .attr('x1', layoutConfig.stack.linkOffset)
      .attr('x2', layoutConfig.stack.cardOffset)
      .attr('y1', (seg) => seg.y)
      .attr('y2', (seg) => seg.y)
      .attr('stroke', layoutConfig.colors.stackRail)
      .attr('stroke-width', 1.5)
      .attr('stroke-dasharray', '4 3')
      .lower();

    const transitionDuration = layoutConfig.transition.fast;

    const applyYearHighlight = (year, active) => {
      const connector = connectorByYear.get(year);
      const dotGroup = dotsByYear.get(year);
      const stackGroup = stackGroupByYear.get(year);

      if (!connector || !dotGroup || !stackGroup) {
        return;
      }

      if (active) {
        connector.raise();
        dotGroup.raise();
        stackGroup.raise();
      }

      connector.transition()
        .duration(transitionDuration)
        .attr('stroke', active ? layoutConfig.colors.connectorHighlight : layoutConfig.colors.connector);

      dotGroup.select('.event-dot')
        .transition()
        .duration(transitionDuration)
        .attr('r', active ? layoutConfig.dot.highlightRadius : layoutConfig.dot.baseRadius);

      stackGroup
        .selectAll('.stack-rail, .stack-hook')
        .transition()
        .duration(transitionDuration)
        .attr('stroke', active ? layoutConfig.colors.connectorHighlight : layoutConfig.colors.stackRail);
    };

    const adjustYearFocus = (year, delta) => {
      const current = activeHighlightCounts.get(year) ?? 0;
      const next = Math.max(0, current + delta);
      activeHighlightCounts.set(year, next);
      if (current === 0 && next > 0) {
        applyYearHighlight(year, true);
      } else if (current > 0 && next === 0) {
        applyYearHighlight(year, false);
      }
    };

    stackItems
      .on('mouseenter', function handleMouseEnter(event, datum) {
        adjustYearFocus(datum.yearKey, 1);

        const group = d3.select(this);
        const rect = group.select('.stack-bg');
        const desc = group.select('.stack-desc');

        group.raise();

        rect
          .transition()
          .duration(transitionDuration)
          .attr('width', datum.expandedWidth)
          .attr('stroke', layoutConfig.colors.cardStrokeActive);

        if (desc.classed('has-content')) {
          desc
            .transition()
            .duration(transitionDuration)
            .style('opacity', 1);

          desc.selectAll('tspan')
            .attr('x', datum.descOffset);
        }
      })
      .on('mouseleave', function handleMouseLeave(event, datum) {
        adjustYearFocus(datum.yearKey, -1);

        const group = d3.select(this);
        const rect = group.select('.stack-bg');
        const desc = group.select('.stack-desc');

        rect
          .transition()
          .duration(transitionDuration)
          .attr('width', datum.baseWidth)
          .attr('stroke', layoutConfig.colors.cardStroke);

        if (desc.classed('has-content')) {
          desc
            .transition()
            .duration(transitionDuration)
            .style('opacity', 0);
        }
      });

    dotGroups
      .on('mouseenter', (event, datum) => {
        adjustYearFocus(datum.year, 1);
      })
      .on('mouseleave', (event, datum) => {
        adjustYearFocus(datum.year, -1);
      });

    const yearTicks = d3.timeYear.range(
      timelineStart,
      d3.timeYear.offset(timelineEnd, 1),
      layoutConfig.yearMarkers.step,
    );

    const yearMarkers = yearsGroup.selectAll('.year-marker')
      .data(yearTicks)
      .enter()
      .append('g')
      .attr('class', 'year-marker');

    yearMarkers.append('line')
      .attr('y1', timelineY - layoutConfig.yearMarkers.tickSize)
      .attr('y2', timelineY + layoutConfig.yearMarkers.tickSize)
      .attr('stroke', '#9ca3af')
      .attr('stroke-width', 1.5);

    yearMarkers.append('text')
      .attr('y', timelineY + layoutConfig.yearMarkers.labelOffset)
      .attr('text-anchor', 'middle')
      .attr('fill', '#6b7280')
      .attr('font-weight', '600')
      .attr('font-size', '13px')
      .text((d) => d.getFullYear());

    const render = (transform = transformRef.current) => {
      const zoomTransform = transform || d3.zoomIdentity;
      const currentScale = zoomTransform.rescaleX(baseScale);

      const positionX = (date) => margin.left + currentScale(date);
      const stackTopY = (yearData) => (
        yearData.isAbove
          ? timelineY - yearData.stackOffset - yearData.totalHeight
          : timelineY + yearData.stackOffset
      );
      const stackAnchorX = (yearData) => positionX(yearData.parsedYearDate);
      const connectorEndY = (yearData) => {
        if (yearData.events.length === 0) {
          return timelineY;
        }
        if (yearData.isAbove) {
          return stackTopY(yearData) + (yearData.connectorTop ?? 0);
        }
        return stackTopY(yearData) + (yearData.connectorBottom ?? 0);
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
      .filter((event) => {
        if (event.type === 'wheel') {
          return event.ctrlKey || event.metaKey;
        }
        if (event.type === 'touchstart' || event.type === 'touchmove') {
          return true;
        }
        return !event.button;
      })
      .scaleExtent([layoutConfig.zoom.min, layoutConfig.zoom.max])
      .translateExtent([[margin.left - innerWidth, 0], [margin.left + innerWidth * 2, height]])
      .on('zoom', (event) => {
        transformRef.current = event.transform;
        render(event.transform);
      });

    svg.call(zoomBehavior);

    const zoomBy = (factor) => {
      const point = pointerRef.current || [margin.left + innerWidth / 2, timelineY];
      svg.transition()
        .duration(layoutConfig.zoom.duration)
        .call(zoomBehavior.scaleBy, factor, point);
    };

    zoomInRef.current = () => zoomBy(layoutConfig.zoom.scaleStep);
    zoomOutRef.current = () => zoomBy(1 / layoutConfig.zoom.scaleStep);
    resetRef.current = () => {
      svg.transition()
        .duration(layoutConfig.zoom.resetDuration)
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
