import React, { useEffect, useRef } from 'react';
import * as d3 from 'd3';

const RAW_EVENTS = [
  { date: 'Jan 1950', label: 'Idea Sparked', description: 'Founders aligned around a bold vision during weekend experiments.' },
  { date: 'Aug 1954', label: 'First Workshop', description: 'A small lab was built to explore early prototypes and materials.' },
  { date: 'Mar 1962', label: 'Research Breakthrough', description: 'Discovered a novel approach that made the core concept viable.' },
  { date: 'Sep 1970', label: 'Company Incorporated', description: 'Formal incorporation with five employees and a single product idea.' },
  { date: 'Jul 1976', label: 'First Product', description: 'Released the inaugural device that gained traction with hobbyists.' },
  { date: 'Nov 1983', label: 'International Debut', description: 'Opened limited distribution in Europe after industry conference buzz.' },
  { date: 'May 1988', label: 'Series A', description: 'Secured strategic capital to scale manufacturing capabilities.' },
  { date: 'Oct 1992', label: 'Strategic Partnership', description: 'Signed landmark deal with a major electronics maker.' },
  { date: 'Jan 1996', label: 'Online Presence', description: 'Launched the first website with digital catalog and ordering.' },
  { date: 'Sep 1998', label: '100K Customers', description: 'Surpassed six figures in lifetime customers driven by mail campaigns.' },
  { date: 'Feb 2000', label: 'Dot-Com Launch', description: 'Rebuilt platform to support transactions and community features.' },
  { date: 'Nov 2001', label: 'Beta Program', description: 'Invited early adopters to shape the second generation product.' },
  { date: 'Jun 2003', label: 'Series B', description: 'Raised $15M to expand R&D and recruit engineering talent.' },
  { date: 'Mar 2005', label: 'Flagship Release', description: 'Shipped the modern flagship product with modular architecture.' },
  { date: 'Jan 2006', label: 'Developer API', description: 'Opened APIs so partners could build on top of platform services.' },
  { date: 'Sep 2007', label: 'Mobile App', description: 'Debuted a mobile companion that quickly became core to usage.' },
  { date: 'Apr 2009', label: 'Cloud Platform', description: 'Transitioned backend to a scalable cloud-native foundation.' },
  { date: 'Dec 2010', label: 'Public Listing', description: 'Completed IPO and rang the bell on the NASDAQ exchange.' },
  { date: 'Aug 2013', label: 'Global Expansion', description: 'Opened offices in APAC and localized product experience.' },
  { date: 'Jan 2016', label: 'AI Research Lab', description: 'Formed internal lab to explore applied machine learning.' },
  { date: 'Jun 2019', label: '1M Users', description: 'Celebrated one million active accounts across all products.' },
  { date: 'Apr 2021', label: 'Next Platform', description: 'Launched platform redesign focused on reliability and speed.' },
  { date: 'Nov 2023', label: 'Sustainability', description: 'Committed to net-zero operations with verified offsets.' },
  { date: 'May 2025', label: 'Future Labs', description: 'Announced next-generation experimentation space for creators.' },
];

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

    const events = RAW_EVENTS.map((event) => ({
      ...event,
      parsedDate: parseDate(event.date),
    })).sort((a, b) => a.parsedDate - b.parsedDate);

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

    const timelineStart = parseDate('Jan 1950');
    const timelineEnd = parseDate('Dec 2025');
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

    rootGroup.append('line')
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
          .attr('x', -140)
          .attr('width', 280)
          .attr('height', 110)
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
          .attr('x', -70)
          .attr('width', 140)
          .attr('height', 45)
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
        <svg ref={svgRef} />
      </div>
    </div>
  );
}
