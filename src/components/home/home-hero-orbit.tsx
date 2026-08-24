"use client";

import { type ComponentType } from "react";
import { motion, useReducedMotion } from "motion/react";
import { FileSpreadsheet, FileText, FileType, Users } from "lucide-react";

type OrbitNode = {
  icon: ComponentType<{ className?: string }>;
  label: string;
};

const NODES: OrbitNode[] = [
  { icon: FileSpreadsheet, label: "Sheets" },
  { icon: FileText, label: "Word" },
  { icon: FileType, label: "PDF" },
  { icon: Users, label: "HR CV" },
];

const RADIUS = 112;
const DURATION = 40;

function OrbitNodeCard({ node }: { node: OrbitNode }) {
  const Icon = node.icon;

  return (
    <div className="flex w-11 flex-col items-center gap-0.5 rounded-lg border border-dashed border-primary/30 bg-primary/5 p-1.5 opacity-60 shadow-sm backdrop-blur-sm">
      <Icon className="size-4 text-primary" />
      <span className="text-[9px] font-medium leading-none">{node.label}</span>
    </div>
  );
}

function OrbitingCirclesGroup({ animate }: { animate: boolean }) {
  const count = NODES.length;

  return (
    <div className="relative size-[min(72vw,17.5rem)] md:size-[18rem]" aria-hidden>
      <div className="absolute left-1/2 top-1/2 size-14 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/20 blur-2xl md:size-16" />

      {animate ? (
        <motion.div
          className="absolute left-1/2 top-1/2 size-10 -translate-x-1/2 -translate-y-1/2 rounded-full border border-primary/25 bg-primary/10 md:size-12"
          animate={{ scale: [1, 1.06, 1], opacity: [0.55, 0.9, 0.55] }}
          transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
        />
      ) : (
        <div className="absolute left-1/2 top-1/2 size-10 -translate-x-1/2 -translate-y-1/2 rounded-full border border-primary/25 bg-primary/10 md:size-12" />
      )}

      {animate ? (
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          <motion.div
            className="relative size-0 transform-gpu will-change-transform"
            animate={{ rotate: 360 }}
            transition={{ duration: DURATION, repeat: Infinity, ease: "linear" }}
          >
            {NODES.map((node, i) => {
              const angle = (360 / count) * i;
              return (
                <div
                  key={node.label}
                  className="absolute left-0 top-0"
                  style={{
                    transform: `rotate(${angle}deg) translateY(-${RADIUS}px)`,
                  }}
                >
                  <motion.div
                    className="transform-gpu will-change-transform"
                    animate={{ rotate: -360 }}
                    transition={{ duration: DURATION, repeat: Infinity, ease: "linear" }}
                  >
                    <div className="-translate-x-1/2 -translate-y-1/2">
                      <OrbitNodeCard node={node} />
                    </div>
                  </motion.div>
                </div>
              );
            })}
          </motion.div>
        </div>
      ) : (
        NODES.map((node, i) => {
          const angle = (360 / count) * i;
          const rad = (angle * Math.PI) / 180;
          const x = Math.sin(rad) * RADIUS;
          const y = -Math.cos(rad) * RADIUS;
          return (
            <div
              key={node.label}
              className="absolute left-1/2 top-1/2"
              style={{ transform: `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))` }}
            >
              <OrbitNodeCard node={node} />
            </div>
          );
        })
      )}
    </div>
  );
}

export function HomeHeroOrbit() {
  const reduceMotion = useReducedMotion();
  const animate = !reduceMotion;

  return (
    <div className="flex min-h-[min(72vw,17.5rem)] items-center justify-center md:min-h-[18rem]">
      <OrbitingCirclesGroup animate={animate} />
    </div>
  );
}
