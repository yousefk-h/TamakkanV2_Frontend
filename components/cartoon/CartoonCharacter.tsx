"use client";

import { useEffect, useRef, type PointerEvent } from "react";
import type { VoiceAgentState } from "@/lib/voice/voiceRoom";

/** Tamakkan's own copy of a simple, locally-drawn cartoon character for Cartoon Practice.
 *
 * Visually modeled on a presentational "Curious Curls" character pattern (hand-drawn inline SVG,
 * no binary assets, no license/attribution required - see docs/cartoon-character-reuse notes in the
 * PR description). This file has zero network/API/tenant code: it is pure `props in -> SVG out`, and
 * is driven only by the REAL `VoiceAgentState` already produced by Tamakkan's existing Voice Practice
 * pipeline (`lib/voice/voiceRoom.ts`) - the same signal that drives the existing Listening/Thinking/
 * Speaking status text in `VoiceCallView`. Nothing here invents state. */

const NO_AUDIO = () => 0;
const HAIR = "#0F2544";
const GOLD = "#D6A752";
const FACE = "#FFFAF2";
const CURLS = [[100,72,30],[134,52,31],[174,53,31],[206,79,29],[217,114,26],[212,150,27],[196,181,27],[103,180,27],[82,149,27],[81,112,27]];

export function CartoonCharacter({ label, agentState = null, readVolume = NO_AUDIO, idleGlances = false }: {
  label: string;
  agentState?: VoiceAgentState | null;
  /** Live 0..1 audio amplitude, polled every frame. Optional - Tamakkan's Voice Practice pipeline does
   * not currently expose an audio-level meter, so when this is omitted the mouth instead approximates
   * speech from the real `agentState === "speaking"` signal itself (gated by actual state, never a
   * free-running timer independent of it). Passing a real meter here (if one is added later) is a
   * strict upgrade with no other changes needed. */
  readVolume?: () => number;
  idleGlances?: boolean;
}) {
  const head = useRef<SVGGElement>(null);
  const body = useRef<SVGGElement>(null);
  const eyes = useRef<SVGGElement>(null);
  const brows = useRef<SVGGElement>(null);
  const mouth = useRef<SVGPathElement>(null);
  const teeth = useRef<SVGPathElement>(null);
  const smile = useRef<SVGPathElement>(null);
  const pupils = useRef<SVGGElement>(null);
  const surprisedMouth = useRef<SVGEllipseElement>(null);
  const pointer = useRef<{ x: number; y: number } | null>(null);
  const hasRealVolume = readVolume !== NO_AUDIO;
  const trackPointer = (event: PointerEvent<SVGSVGElement>) => {
    if (event.pointerType === "touch") return;
    const matrix = head.current?.getScreenCTM();
    if (!matrix) return;
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
    pointer.current = {
      x: Math.max(-1, Math.min(1, (point.x - 150) / 65)) * 3.5,
      y: Math.max(-1, Math.min(1, (point.y - 120) / 75)) * 2,
    };
  };
  const input = useRef({ agentState, readVolume, idleGlances, hasRealVolume });
  useEffect(() => { input.current = { agentState, readVolume, idleGlances, hasRealVolume }; }, [agentState, readVolume, idleGlances, hasRealVolume]);
  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0;
    let last = 0;
    let level = 0;
    let currentGazeX = 0;
    let currentGazeY = 0;
    const start = performance.now();
    const animate = (now: number) => {
      const elapsed = now - start;
      if (now - last >= (reduced.matches ? 100 : 50)) {
        last = now;
        const speaking = input.current.agentState === "speaking";
        let raw = 0;
        if (input.current.hasRealVolume) {
          try { raw = input.current.readVolume(); } catch { /* Keep the closed-mouth idle pose. */ }
        } else if (speaking) {
          // No live audio metering wired up yet - approximate a talking mouth strictly while the real
          // "speaking" state is active, never independent of it.
          raw = 0.35 + Math.sin(elapsed / 140) * 0.25;
        }
        const target = Number.isFinite(raw) && raw > 0.025 ? Math.min(1, raw * 3.5) : 0;
        level += (target - level) * (target > level ? 0.65 : 0.5);
        const thinking = input.current.agentState === "thinking";
        const hovering = pointer.current !== null;
        const motion = reduced.matches ? 0 : 1;
        const breathe = Math.sin(elapsed / 800) * 1.1 * motion;
        const tilt = (thinking ? -4 : 3) + Math.sin(elapsed / 2100) * 0.8 * motion;
        const blinkTime = elapsed % 13700;
        const blink = motion && ((blinkTime > 3980 && blinkTime < 4135) || (blinkTime > 9740 && blinkTime < 9895));
        body.current?.setAttribute("transform", `translate(0 ${-breathe * 0.55})`);
        head.current?.setAttribute("transform", `translate(0 ${-breathe}) rotate(${tilt} 150 205)`);
        eyes.current?.setAttribute("transform", `translate(0 120) scale(1 ${blink ? 0.06 : hovering ? 1.12 : thinking ? 0.85 : 1}) translate(0 -120)`);
        brows.current?.setAttribute("transform", `translate(0 ${hovering ? -5 : thinking ? -4 : -level * 2})`);
        let gazeX = thinking ? 3 : 0;
        let gazeY = thinking ? -3 : 0;
        if (input.current.idleGlances && motion && !thinking) {
          // Two short, eased glances with a relaxed forward gaze between them.
          const glanceTime = elapsed % 14000;
          const left = glanceTime < 7000;
          const progress = (glanceTime - (left ? 2500 : 9500)) / 2000;
          const glance = progress > 0 && progress < 1 ? Math.sin(Math.PI * progress) ** 2 : 0;
          gazeX = (left ? -3 : 3) * glance;
          gazeY = -0.6 * glance;
        }
        if (pointer.current) {
          gazeX = pointer.current.x;
          gazeY = pointer.current.y;
        }
        currentGazeX += (gazeX - currentGazeX) * (reduced.matches ? 1 : 0.35);
        currentGazeY += (gazeY - currentGazeY) * (reduced.matches ? 1 : 0.35);
        pupils.current?.setAttribute("transform", `translate(${currentGazeX} ${currentGazeY})`);
        const h = 5 + level * 22;
        const w = 24 + level * 10;
        mouth.current?.setAttribute("d", `M${150 - w / 2} 153q${w / 2} 6 ${w} 0q-1 ${h} ${-w / 2} ${h}t${-w / 2} ${-h}z`);
        mouth.current?.setAttribute("opacity", level > 0.06 ? "1" : "0");
        const teethWidth = w - 4;
        const teethHeight = Math.min(3, (h - 5) * 0.4);
        teeth.current?.setAttribute("d", `M${150 - teethWidth / 2} 154q${teethWidth / 2} 5 ${teethWidth} 0l-1 ${teethHeight}q${-(teethWidth - 2) / 2} 4 ${-(teethWidth - 2)} 0z`);
        teeth.current?.setAttribute("opacity", level > 0.06 ? "1" : "0");
        smile.current?.setAttribute("opacity", level > 0.06 || hovering ? "0" : "1");
        surprisedMouth.current?.setAttribute("opacity", hovering && level <= 0.06 ? "1" : "0");
      }
      frame = requestAnimationFrame(animate);
    };
    const visibility = () => {
      cancelAnimationFrame(frame);
      if (document.visibilityState === "hidden") pointer.current = null;
      if (document.visibilityState !== "hidden") frame = requestAnimationFrame(animate);
    };
    const clearPointer = () => { pointer.current = null; };
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("blur", clearPointer);
    visibility();
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("blur", clearPointer);
    };
  }, []);
  return (
    <svg viewBox="0 0 300 300" role="img" aria-label={label} className="h-full max-h-[280px] w-full max-w-[280px]" pointerEvents="none"
      onPointerEnter={trackPointer} onPointerMove={trackPointer}
      onPointerLeave={() => { pointer.current = null; }} onPointerCancel={() => { pointer.current = null; }}>
      <title>{label}</title>
      <g ref={body} pointerEvents="visiblePainted">
        <path fill={GOLD} d="M59 289q3-84 91-84t91 84z" />
        <path fill="white" d="M123 206l27 18-11 14-20-23z M177 206l-27 18 11 14 20-23z" />
        <path fill="none" stroke={HAIR} strokeWidth="3" strokeLinecap="round" d="M150 228v58" />
        <circle fill={HAIR} cx="182" cy="241" r="4" />
        <path fill={FACE} stroke={HAIR} strokeWidth="2.2" d="M134 174h32v32q-16 17-32 0z" />
      </g>
      <g ref={head} pointerEvents="visiblePainted">
        <g fill={HAIR} stroke="white" strokeWidth="1.2">
          {CURLS.map(([cx,cy,r]) => <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={r} />)}
        </g>
        <g fill={FACE} stroke={HAIR} strokeWidth="2.2">
          <ellipse cx="94" cy="131" rx="8" ry="12" /><ellipse cx="206" cy="131" rx="8" ry="12" />
          <ellipse cx="150" cy="121" rx="53" ry="64" />
        </g>
        <g fill={GOLD} opacity="0.22"><ellipse cx="116" cy="144" rx="9" ry="5" /><ellipse cx="184" cy="144" rx="9" ry="5" /></g>
        <g ref={eyes}>
          <g fill="white"><ellipse cx="130" cy="120" rx="11" ry="10" /><ellipse cx="170" cy="120" rx="11" ry="10" /></g>
          <g ref={pupils}>
            <g fill={HAIR}><circle cx="130" cy="121" r="4.8" /><circle cx="170" cy="121" r="4.8" /></g>
            <g fill="white"><circle cx="131" cy="119" r="1.5" /><circle cx="171" cy="119" r="1.5" /></g>
          </g>
          <g fill="none" stroke={HAIR} strokeWidth="3" strokeLinecap="round"><path d="M118 117q12-13 24 0" /><path d="M158 117q12-13 24 0" /></g>
        </g>
        <g ref={brows} fill="none" stroke={HAIR} strokeWidth="3" strokeLinecap="round"><path d="M119 103q11-5 22-1" /><path d="M159 102q11-4 22 1" /></g>
        <path fill="none" stroke={HAIR} strokeWidth="2" opacity="0.35" d="M151 129q-6 9 1 9" />
        <path ref={smile} fill="none" stroke={HAIR} strokeWidth="3" strokeLinecap="round" d="M134 153q16 9 32 0" />
        <path ref={mouth} fill={HAIR} opacity="0" d="M138 153q12 6 24 0q-1 12-12 12t-12-12z" />
        <path ref={teeth} fill="white" opacity="0" d="M140 154q10 5 20 0l-1 2q-9 4-18 0z" />
        <ellipse ref={surprisedMouth} fill={HAIR} opacity="0" cx="150" cy="157" rx="3.8" ry="5.5" />
        <g fill={GOLD}><ellipse cx="94" cy="147" rx="4" ry="5" /><ellipse cx="206" cy="147" rx="4" ry="5" /></g>
        <g fill="none" stroke={HAIR} strokeWidth="2.5"><circle cx="129" cy="120" r="20" /><circle cx="171" cy="120" r="20" /><path d="M149 119h2m-42-2-12-5m94 5 12-5" /></g>
        <path fill={GOLD} d="M94 97q2-53 56-54 54 1 56 54l-9-4q-4-40-47-42-43 2-47 42z" />
        <path fill={HAIR} stroke="white" strokeWidth="1.2" d="M101 93q-6-26 16-34 10-24 31-14 22-11 30 10 24-1 24 28-27 7-47-21-13 24-54 31z" />
      </g>
    </svg>
  );
}
