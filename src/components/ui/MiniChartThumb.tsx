const CONFIGS = [
  {
    nodes: [[48,14],[16,44],[48,44],[80,44],[8,72],[28,72],[58,72],[88,72]],
    lines: [[48,14,16,44],[48,14,48,44],[48,14,80,44],[16,44,8,72],[16,44,28,72],[48,44,58,72],[80,44,88,72]],
  },
  {
    nodes: [[48,10],[22,38],[74,38],[10,66],[34,66],[62,66],[86,66]],
    lines: [[48,10,22,38],[48,10,74,38],[22,38,10,66],[22,38,34,66],[74,38,62,66],[74,38,86,66]],
  },
  {
    nodes: [[48,12],[24,40],[72,40],[12,68],[36,68],[60,68],[84,68]],
    lines: [[48,12,24,40],[48,12,72,40],[24,40,12,68],[24,40,36,68],[72,40,60,68],[72,40,84,68]],
  },
]

const COLOURS = ['#0EA5E9','#10B981','#8B5CF6','#F59E0B','#EF4444']

export function MiniChartThumb({ id }: { id: number }) {
  const cfg = CONFIGS[(id - 1) % CONFIGS.length]
  return (
    <svg viewBox="0 0 96 84" style={{ width: '100%', height: '100%', display: 'block' }}>
      {cfg.lines.map(([x1,y1,x2,y2], i) => (
        <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="rgba(148,163,184,0.2)" strokeWidth={1} />
      ))}
      {cfg.nodes.map(([cx,cy], i) => (
        <g key={i}>
          <rect x={cx-18} y={cy-9} width={36} height={18} rx={3}
            fill={i===0 ? COLOURS[0] : 'rgba(148,163,184,0.07)'}
            stroke={COLOURS[i % COLOURS.length]}
            strokeWidth={i===0 ? 0 : 0.75} strokeOpacity={0.45}
          />
          <rect x={cx-10} y={cy-3} width={i===0 ? 20 : 12} height={3} rx={1}
            fill={i===0 ? 'rgba(255,255,255,0.75)' : 'rgba(148,163,184,0.28)'} />
          <rect x={cx-7}  y={cy+1} width={i===0 ? 14 : 8}  height={2} rx={1}
            fill={i===0 ? 'rgba(255,255,255,0.4)' : 'rgba(148,163,184,0.15)'} />
        </g>
      ))}
    </svg>
  )
}
