'use client';

import { useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  forceCenter,
  forceLink,
  forceManyBody,
  forceSimulation,
  type SimulationNodeDatum,
} from 'd3-force';
import type { Graph, GraphLink, GraphNode } from '@/lib/db/queries/graph';
import { artistGenreAncestors, colourForAncestor, topLevelAncestors } from './graph-colour';
import { boundsFor, radiusFor, CANVAS_WIDTH as WIDTH, CANVAS_HEIGHT as HEIGHT } from './graph-layout';
import type { GenreOption } from './GraphView';

/**
 * SPEC.md §8.1's force-directed network.
 *
 * **d3-force computes positions; React renders the SVG.** `d3-selection` and
 * `d3-zoom` are not dependencies of this project and CLAUDE.md §5 says not to
 * add one to avoid writing twenty lines — so pan and zoom are a viewBox
 * transform, and the DOM is React's.
 *
 * **The simulation is run to completion before the first paint, not animated.**
 * A settling animation makes the layout non-deterministic to look at and forces
 * every test to race it. `d3-force`'s own alpha schedule is used, ticked
 * synchronously, so the same collection always produces the same picture.
 *
 * **No force is applied that the data does not justify.** Charge, link and
 * centre only: nothing clusters unconnected nodes, and nothing sets a minimum
 * distance that would space a scatter into an apparent pattern. §8.1 —
 * "a layout that implies structure where the data has none would be
 * confidently misleading". Four unrelated artists look like four dots because
 * that is what they are.
 */

const TICKS = 300;

type PositionedNode = GraphNode & SimulationNodeDatum & { colour: string; radius: number };

function layout(graph: Graph): { nodes: PositionedNode[]; links: GraphLink[] } {
  const genreParents = graph.nodes
    .filter((node) => node.type === 'genre')
    .map((node) => ({ id: node.id, parentGenreId: node.parentGenreId }));

  /**
   * Ancestors are keyed by the PREFIXED node id, because `parentGenreId` is a
   * bare uuid while node ids carry a `genre:` prefix. Walking the two
   * namespaces together would silently find no parent and colour every genre
   * as its own root.
   */
  const prefixedParents = genreParents.map((genre) => ({
    id: genre.id,
    parentGenreId: genre.parentGenreId === null ? null : `genre:${genre.parentGenreId}`,
  }));

  const ancestors = topLevelAncestors(prefixedParents);

  /**
   * Artists inherit their colour by walking `has_genre` then `genre_parent`
   * (§8.1), so an artist sits in the same colour family as the genre carrying
   * most of their records. One with no genre edge stays grey.
   */
  const artistAncestors = artistGenreAncestors(
    graph.nodes
      .filter((node) => node.type === 'genre')
      .map((node) => ({ id: node.id, label: node.label, parentGenreId: node.parentGenreId })),
    graph.links,
  );

  // Both node kinds resolve into the SAME ancestor space, so an artist and its
  // genre are never assigned different colours for the same root.
  const ancestorIds = [
    ...new Set([...ancestors.values(), ...artistAncestors.values()]),
  ];

  const nodes: PositionedNode[] = graph.nodes.map((node, index) => ({
    ...node,
    // Seeded from the index on a circle rather than at random: the payload is
    // deterministically ordered (§8.2's rule), so the layout is too.
    x: WIDTH / 2 + Math.cos((index / Math.max(graph.nodes.length, 1)) * 2 * Math.PI) * 200,
    y: HEIGHT / 2 + Math.sin((index / Math.max(graph.nodes.length, 1)) * 2 * Math.PI) * 200,
    colour: colourForAncestor(
      (node.type === 'genre' ? ancestors.get(node.id) : artistAncestors.get(node.id)) ?? null,
      ancestorIds,
    ),
    radius: radiusFor(node.ownedCount),
  }));

  const byId = new Map(nodes.map((node) => [node.id, node]));
  // An edge whose endpoint is missing would throw inside forceLink. The query
  // layer already drops these; this is the render refusing to assume it.
  const links = graph.links.filter((link) => byId.has(link.source) && byId.has(link.target));

  const simulation = forceSimulation(nodes)
    .force(
      'link',
      forceLink<PositionedNode, GraphLink & SimulationNodeDatum>(
        links.map((link) => ({ ...link }) as GraphLink & SimulationNodeDatum),
      )
        .id((node) => (node as PositionedNode).id)
        .distance(90),
    )
    .force('charge', forceManyBody().strength(-220))
    .force('centre', forceCenter(WIDTH / 2, HEIGHT / 2))
    .stop();

  simulation.tick(TICKS);

  return { nodes, links };
}


export function GraphCanvas({
  graph,
  genres,
  selectedGenreId,
}: {
  graph: Graph;
  genres: GenreOption[];
  selectedGenreId: string | null;
}) {
  const router = useRouter();
  const { nodes, links } = useMemo(() => layout(graph), [graph]);

  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number } | null>(null);

  const nodeById = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);

  function openNode(node: PositionedNode) {
    const [kind, id] = node.id.split(':');
    // §8.1: "Clicking a node filters the collection list to that artist/genre."
    router.push(kind === 'artist' ? `/?artistId=${id}` : `/?genreId=${id}`);
  }

  const bounds = useMemo(() => boundsFor(nodes), [nodes]);
  const viewWidth = bounds.w / zoom;
  const viewHeight = bounds.h / zoom;
  const viewBox = `${bounds.x + pan.x} ${bounds.y + pan.y} ${viewWidth} ${viewHeight}`;

  if (nodes.length === 0) {
    return (
      <p className="mt-6 text-sm text-muted-foreground">
        Nothing to draw yet — the graph shows artists and genres from records you own.
      </p>
    );
  }

  return (
    <div className="mt-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Genre subset
          <select
            className="h-9 rounded-xs border border-border bg-background px-2 text-sm text-foreground"
            value={selectedGenreId ?? ''}
            onChange={(event) => {
              const value = event.target.value;
              router.push(value === '' ? '/graph' : `/graph?genreId=${value}`);
            }}
          >
            <option value="">All genres</option>
            {genres.map((genre) => (
              <option key={genre.id} value={genre.id}>
                {genre.name}
              </option>
            ))}
          </select>
        </label>

        <button
          type="button"
          onClick={() => {
            setZoom(1);
            setPan({ x: 0, y: 0 });
          }}
          className="h-9 rounded-xs border border-border px-3 text-sm"
        >
          Reset zoom
        </button>

        <p className="text-xs text-muted-foreground">
          {nodes.length} node{nodes.length === 1 ? '' : 's'} · {links.length} connection
          {links.length === 1 ? '' : 's'}
        </p>
      </div>

      <svg
        role="img"
        aria-label="Network of artists and genres in the collection"
        viewBox={viewBox}
        className="mt-3 w-full touch-none rounded-xs border border-border bg-card"
        style={{ height: HEIGHT }}
        onWheel={(event) => {
          const next = Math.min(4, Math.max(0.4, zoom * (event.deltaY < 0 ? 1.1 : 0.9)));
          setZoom(next);
        }}
        onPointerDown={(event) => {
          drag.current = { x: event.clientX, y: event.clientY };
        }}
        onPointerMove={(event) => {
          if (drag.current === null) return;

          const dx = (event.clientX - drag.current.x) / zoom;
          const dy = (event.clientY - drag.current.y) / zoom;

          /**
           * Capture only once the pointer has actually MOVED. Capturing on
           * pointerdown swallows the click that follows, so clicking a node did
           * nothing at all — the pan handler ate the §8.1 click-to-filter
           * interaction, which keyboard activation still performed correctly.
           */
          if (!event.currentTarget.hasPointerCapture(event.pointerId)) {
            if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
            event.currentTarget.setPointerCapture(event.pointerId);
          }

          drag.current = { x: event.clientX, y: event.clientY };
          setPan((current) => ({ x: current.x - dx, y: current.y - dy }));
        }}
        onPointerUp={(event) => {
          drag.current = null;
          if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
          }
        }}
      >
        {links.map((link, index) => {
          const source = nodeById.get(link.source);
          const target = nodeById.get(link.target);
          if (source === undefined || target === undefined) return null;

          return (
            <line
              key={`${link.source}-${link.target}-${link.type}-${index}`}
              data-testid="graph-link"
              x1={source.x ?? 0}
              y1={source.y ?? 0}
              x2={target.x ?? 0}
              y2={target.y ?? 0}
              stroke="currentColor"
              className="text-border"
              // A shared lineup is a fact; an influence is a judgement (§4.3).
              // They are drawn differently because they mean different things.
              strokeDasharray={link.type === 'shared_member' ? '4 3' : undefined}
              strokeWidth={Math.min(1 + link.weight * 0.5, 4)}
            >
              <title>
                {source.label} — {target.label} ({link.type.replace('_', ' ')}, weight{' '}
                {link.weight})
              </title>
            </line>
          );
        })}

        {nodes.map((node) => (
          <g
            key={node.id}
            data-testid="graph-node"
            role="button"
            tabIndex={0}
            className="cursor-pointer"
            onClick={() => openNode(node)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                openNode(node);
              }
            }}
          >
            <circle
              cx={node.x ?? 0}
              cy={node.y ?? 0}
              r={node.radius}
              fill={node.colour}
              fillOpacity={node.type === 'genre' ? 0.85 : 0.6}
              stroke="currentColor"
              className="text-border"
            />
            <text
              x={node.x ?? 0}
              y={(node.y ?? 0) + node.radius + 11}
              textAnchor="middle"
              className="fill-foreground text-[10px]"
            >
              {node.label}
            </text>
            <title>
              {node.label} — {node.ownedCount} record{node.ownedCount === 1 ? '' : 's'}
            </title>
          </g>
        ))}
      </svg>
    </div>
  );
}
