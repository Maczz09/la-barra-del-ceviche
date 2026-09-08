// services/alertasSonoras.service.ts — campanitas locales para los tableros.
// Web Audio evita descargar archivos, funciona sin Internet y no envía datos.

import { ETAPAS_SONORAS, type EtapaSonora } from '../domain/alertasTablero';

const PREFERENCIA_KEY = 'restoapp.alertas_sonoras';
type Nota = { frecuencia: number; inicio: number; duracion: number; volumen: number };

// Tres firmas cortas y diferentes: doble campana (nuevo), dos tonos cálidos
// (preparación) y un ascenso de tres tonos (listo para pase).
const PATRONES: Record<EtapaSonora, Nota[]> = {
  PENDIENTE: [
    { frecuencia: 1046.5, inicio: 0, duracion: 0.12, volumen: 0.09 },
    { frecuencia: 1318.5, inicio: 0.15, duracion: 0.18, volumen: 0.11 },
  ],
  EN_PREPARACION: [
    { frecuencia: 740, inicio: 0, duracion: 0.13, volumen: 0.09 },
    { frecuencia: 880, inicio: 0.16, duracion: 0.16, volumen: 0.09 },
  ],
  LISTO: [
    { frecuencia: 1046.5, inicio: 0, duracion: 0.09, volumen: 0.08 },
    { frecuencia: 1318.5, inicio: 0.12, duracion: 0.09, volumen: 0.09 },
    { frecuencia: 1568, inicio: 0.24, duracion: 0.18, volumen: 0.12 },
  ],
};

type AudioContextConstructor = new () => AudioContext;
type WindowWithWebkitAudio = Window & { webkitAudioContext?: AudioContextConstructor };
let context: AudioContext | null = null;

function preferidas(): boolean {
  try { return localStorage.getItem(PREFERENCIA_KEY) !== 'false'; } catch { return true; }
}

function guardarPreferencia(valor: boolean) {
  try { localStorage.setItem(PREFERENCIA_KEY, String(valor)); } catch { /* navegación privada */ }
}

function crearContexto(): AudioContext | null {
  if (context) return context;
  if (typeof window === 'undefined') return null;
  const Constructor = window.AudioContext ?? (window as WindowWithWebkitAudio).webkitAudioContext;
  if (!Constructor) return null;
  context = new Constructor();
  return context;
}

function tocarNota(audio: AudioContext, nota: Nota, inicio: number) {
  const oscillator = audio.createOscillator();
  const armonico = audio.createOscillator();
  const gain = audio.createGain();
  const gainArmonico = audio.createGain();
  const start = inicio + nota.inicio;
  const end = start + nota.duracion;

  oscillator.type = 'sine';
  oscillator.frequency.setValueAtTime(nota.frecuencia, start);
  armonico.type = 'sine';
  armonico.frequency.setValueAtTime(nota.frecuencia * 2.01, start);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(nota.volumen, start + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, end);
  gainArmonico.gain.setValueAtTime(0.0001, start);
  gainArmonico.gain.exponentialRampToValueAtTime(nota.volumen * 0.26, start + 0.009);
  gainArmonico.gain.exponentialRampToValueAtTime(0.0001, end);
  oscillator.connect(gain).connect(audio.destination);
  armonico.connect(gainArmonico).connect(audio.destination);
  oscillator.start(start);
  armonico.start(start);
  oscillator.stop(end + 0.02);
  armonico.stop(end + 0.02);
}

export const alertasSonoras = {
  preferidas,

  activa() {
    return context?.state === 'running';
  },

  async activar(): Promise<boolean> {
    const audio = crearContexto();
    if (!audio) return false;
    try {
      await audio.resume();
      const activa = audio.state === 'running';
      if (activa) guardarPreferencia(true);
      return activa;
    } catch {
      return false;
    }
  },

  async desactivar() {
    guardarPreferencia(false);
    if (context?.state === 'running') await context.suspend();
  },

  tocar(etapas: readonly EtapaSonora[]) {
    if (!preferidas() || context?.state !== 'running') return;
    const unicas = ETAPAS_SONORAS.filter((etapa) => etapas.includes(etapa));
    unicas.forEach((etapa, indice) => {
      const inicio = context!.currentTime + 0.025 + indice * 0.52;
      PATRONES[etapa].forEach((nota) => tocarNota(context!, nota, inicio));
    });
  },
};
