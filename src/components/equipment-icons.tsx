import type { Equipment } from '@/lib/types';

/** Icone originali in stile lineare per l'attrezzatura (24x24). */
const P: Partial<Record<Equipment, JSX.Element>> = {
  dumbbell: <><rect x="2" y="8" width="3" height="8" rx="1" /><rect x="5" y="6" width="3" height="12" rx="1" /><path d="M8 12h8" /><rect x="16" y="6" width="3" height="12" rx="1" /><rect x="19" y="8" width="3" height="8" rx="1" /></>,
  barbell: <><path d="M1 12h22" /><rect x="4" y="5" width="2.5" height="14" rx="1" /><rect x="7" y="7" width="2" height="10" rx="1" /><rect x="15" y="7" width="2" height="10" rx="1" /><rect x="17.5" y="5" width="2.5" height="14" rx="1" /></>,
  ez_bar: <><path d="M1 12h5l2-2 2 4 2-4 2 4 2-2h7" /><rect x="3" y="7" width="2" height="10" rx="1" /><rect x="19" y="7" width="2" height="10" rx="1" /></>,
  flat_bench: <><rect x="3" y="9" width="18" height="3" rx="1.5" /><path d="M6 12v7M18 12v7M4 19h4M16 19h4" /></>,
  incline_bench: <><path d="M5 17l10-10" strokeWidth="3" /><rect x="12" y="13" width="9" height="3" rx="1.5" /><path d="M7 17v3M18 16v4M5 20h15" /></>,
  squat_rack: <><path d="M5 3v18M19 3v18M3 21h4M17 21h4M5 8h3M19 8h-3M2 8h20" /><circle cx="3" cy="8" r="1.5" /><circle cx="21" cy="8" r="1.5" /></>,
  smith: <><path d="M4 3v18M20 3v18M2 21h20M4 3h16" /><path d="M4 11h16" strokeWidth="2.5" /></>,
  cable: <><path d="M5 2v20M3 22h6M5 4h10" /><circle cx="15" cy="4" r="1.5" /><path d="M15 5.5v9" strokeDasharray="1.5 1.5" /><path d="M13 15h4l-1 4h-2z" /></>,
  lat_machine: <><path d="M12 2v6M5 8h14" /><path d="M5 8l-1 3M19 8l1 3" /><rect x="8" y="16" width="8" height="2.5" rx="1" /><path d="M12 18.5V22M8 22h8" /></>,
  leg_press: <><path d="M3 20l8-8" strokeWidth="2.5" /><path d="M14 4l6 6" strokeWidth="2.5" /><path d="M11 12l6-5" /><path d="M2 21h20" /></>,
  leg_extension: <><rect x="4" y="12" width="10" height="3" rx="1.5" /><path d="M5 12V4" strokeWidth="2.5" /><path d="M14 13l5 4" /><circle cx="19.5" cy="17.5" r="1.8" /><path d="M9 15v6M5 21h8" /></>,
  leg_curl: <><rect x="2" y="10" width="16" height="3" rx="1.5" /><path d="M18 11l3-5" /><circle cx="21" cy="5" r="1.8" /><path d="M5 13v7M15 13v7M3 20h14" /></>,
  chest_press: <><path d="M6 3v13" strokeWidth="2.5" /><rect x="4" y="15" width="8" height="2.5" rx="1" /><path d="M6 9h11M17 7v4" /><path d="M8 17.5V22M4 22h8" /></>,
  pec_deck: <><path d="M12 3v14" strokeWidth="2.5" /><path d="M5 7c2 0 4 1 7 3 3-2 5-3 7-3" /><path d="M5 5v5M19 5v5" /><path d="M12 17v4M8 21h8" /></>,
  shoulder_machine: <><path d="M8 4v12" strokeWidth="2.5" /><path d="M8 7h8M16 4v6" /><rect x="5" y="15" width="8" height="2.5" rx="1" /><path d="M9 17.5V22M5 22h8" /></>,
  pullup_bar: <><path d="M2 5h20" strokeWidth="2.5" /><path d="M4 5v4M20 5v4" /><circle cx="12" cy="11" r="2" /><path d="M12 13v5M9 7l3 4 3-4" /></>,
  parallel_bars: <><path d="M3 9h7M14 9h7" strokeWidth="2.5" /><path d="M4 9v12M9 9v12M15 9v12M20 9v12" /></>,
  dip_bar: <><path d="M4 8h16" strokeWidth="2.5" /><path d="M6 8v13M18 8v13M4 21h4M16 21h4" /></>,
  kettlebell: <><path d="M8 9a4 4 0 1 1 8 0" /><circle cx="12" cy="15" r="6" /></>,
  band: <><path d="M4 12c0-5 4-8 8-8s8 3 8 8-4 8-8 8" /><path d="M12 20c-3 0-5-2-5-4" /></>,
  trx: <><path d="M12 2v6M12 8l-5 9M12 8l5 9" /><rect x="4" y="17" width="5" height="2.5" rx="1" /><rect x="15" y="17" width="5" height="2.5" rx="1" /></>,
  mat: <><rect x="3" y="8" width="16" height="10" rx="2" /><path d="M19 8a2 2 0 0 1 0 4" /><circle cx="19" cy="13" r="3" /></>,
  jump_rope: <><path d="M5 4v6M19 4v6" strokeWidth="2.5" /><path d="M5 10c0 8 14 8 14 0" /></>,
  bike: <><circle cx="12" cy="17" r="3.5" /><path d="M12 17V8M8 7h6M12 8l5-3M17 5h2M5 21h14" /></>,
  treadmill: <><path d="M3 18h15l3-3" /><path d="M18 18V5h3" /><circle cx="5" cy="20" r="1" /><circle cx="15" cy="20" r="1" /></>,
  elliptical: <><ellipse cx="11" cy="17" rx="7" ry="3" /><path d="M17 15l2-11M15 6h5" /><path d="M2 21h18" /></>,
  rower: <><path d="M2 18h20" /><rect x="6" y="15" width="5" height="3" rx="1" /><circle cx="19" cy="13" r="3.5" /><path d="M16 13H9" /></>,
  machine_other: <><rect x="4" y="3" width="6" height="18" rx="1" /><path d="M5 7h4M5 10h4M5 13h4M10 6h8M18 6v8" /><rect x="15" y="14" width="6" height="2.5" rx="1" /></>,
  medicine_ball: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18" /></>,
  box: <><rect x="3" y="8" width="18" height="12" rx="1.5" /><path d="M3 12h18" /></>,
  hack_squat: <><path d="M5 20L15 4" strokeWidth="2.5" /><path d="M8 18l9-12" /><path d="M2 21h20" /></>,
  calf_machine: <><path d="M6 3v10h10V3" /><rect x="5" y="16" width="12" height="2.5" rx="1" /><path d="M11 13v3M3 21h18" /></>,
  hip_thrust_machine: <><rect x="3" y="12" width="7" height="3" rx="1.5" /><path d="M10 13c3-4 6-4 9 0" /><path d="M5 15v6M17 13v8M3 21h17" /></>,
  ab_wheel: <><circle cx="12" cy="14" r="5" /><path d="M3 14h18" strokeWidth="2.5" /></>,
  other: <><circle cx="6" cy="12" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="18" cy="12" r="2" /></>,
  bodyweight: <><circle cx="12" cy="4.5" r="2.5" /><path d="M12 7v8M7 10h10M12 15l-4 6M12 15l4 6" /></>,
};

export function EquipmentIcon({ id, size = 28 }: { id: Equipment; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {P[id] ?? P.other}
    </svg>
  );
}
