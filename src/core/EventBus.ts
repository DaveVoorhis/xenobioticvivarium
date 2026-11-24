import * as THREE from 'three';
import type { Entity } from '../simulation/types';

export type LogCategory = 'genesis' | 'speciation' | 'predation' | 'cooperation' | 'ecology' | 'system';

export type FragmentKind = 'flesh' | 'flora' | 'fungus' | 'pellet';

export type AudioCueType =
  | 'biogenesis'
  | 'phytogenesis'
  | 'mycogenesis'
  | 'speciation'
  | 'feed'
  | 'strike'
  | 'tear'
  | 'spore'
  | 'hop'
  | 'mate';

export interface SimEventMap {
  'log': { message: string; category: LogCategory; toneClass: string };
  'fx:burst': { position: THREE.Vector3; colorHex: number; count: number; speed: number };
  'fx:fragments': {
    position: THREE.Vector3;
    colorHex: number;
    accentHex?: number;
    kind: FragmentKind;
    count: number;
    speed: number;
    suctionTarget?: THREE.Vector3;
    ejectDir?: THREE.Vector3;
  };
  'fx:shockwave': { position: THREE.Vector3; colorHex: number; maxScale?: number };
  'audio:cue': { type: AudioCueType };
  'entity:spawned': { entity: Entity };
  'entity:disposed': { entity: Entity };
  'entity:morphed': { from: Entity; to: Entity };
  'selection:changed': { entity: Entity | null };
  'toast': { message: string };
  'ecosystem:reset': Record<string, never>;
}

type Listener<T> = (payload: T) => void;

export class EventBus {
  private listeners = new Map<keyof SimEventMap, Set<Listener<unknown>>>();

  on<K extends keyof SimEventMap>(event: K, listener: Listener<SimEventMap[K]>): () => void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(listener as Listener<unknown>);
    return () => this.off(event, listener);
  }

  off<K extends keyof SimEventMap>(event: K, listener: Listener<SimEventMap[K]>): void {
    this.listeners.get(event)?.delete(listener as Listener<unknown>);
  }

  emit<K extends keyof SimEventMap>(event: K, payload: SimEventMap[K]): void {
    const set = this.listeners.get(event);
    if (!set) return;
    for (const fn of set) {
      (fn as Listener<SimEventMap[K]>)(payload);
    }
  }

  clear(): void {
    this.listeners.clear();
  }
}
