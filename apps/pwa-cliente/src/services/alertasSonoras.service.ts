// services/alertasSonoras.service.ts — campanitas locales para los tableros.
// Web Audio evita descargar archivos, funciona sin Internet y no envía datos.

import { ETAPAS_SONORAS, type EtapaSonora } from '../domain/alertasTablero';

const PREFERENCIA_KEY = 'restoapp.alertas_sonoras';
type Nota = { frecuencia: number; inicio: number; duracion: number; volumen: number };

// Tres firmas cortas y diferentes: doble campana (nuevo), dos tonos cálidos
// (preparación) y un ascenso de tres tonos (listo para pase).
const PATRONES: Record<EtapaSonora, Nota[]> = {
  PENDIENTE: [
    { frecuencia: 1046.5, inicio: 0, duracion: 0.16, volumen: 0.38 },
    { frecuencia: 1318.5, inicio: 0.18, duracion: 0.24, volumen: 0.52 },
  ],
  EN_PREPARACION: [
    { frecuencia: 740, inicio: 0, duracion: 0.17, volumen: 0.36 },
    { frecuencia: 880, inicio: 0.2, duracion: 0.22, volumen: 0.44 },
  ],
  LISTO: [
    { frecuencia: 1046.5, inicio: 0, duracion: 0.13, volumen: 0.34 },
    { frecuencia: 1318.5, inicio: 0.16, duracion: 0.13, volumen: 0.43 },
    { frecuencia: 1568, inicio: 0.32, duracion: 0.25, volumen: 0.58 },
  ],
};

type AudioContextConstructor = new () => AudioContext;
type WindowWithWebkitAudio = Window & { webkitAudioContext?: AudioContextConstructor };
let context: AudioContext | null = null;
let salida: GainNode | null = null;

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

/**
 * Safari/iOS necesita reproducir un nodo durante el gesto humano, no solo
 * ejecutar `resume()`. Este buffer inaudible desbloquea el canal sin emitir
 * un sonido de prueba cada vez que alguien navega por la aplicación.
 */
function desbloquearAudio(audio: AudioContext) {
  const buffer = audio.createBuffer(1, 1, audio.sampleRate);
  const source = audio.createBufferSource();
  const silencio = audio.createGain();
  silencio.gain.setValueAtTime(0.0001, audio.currentTime);
  source.buffer = buffer;
  source.connect(silencio).connect(destino(audio));
  source.start();
  source.stop(audio.currentTime + 0.01);
}

/** Una salida protegida de clipping para que la campanita se perciba mejor en móvil. */
function destino(audio: AudioContext): GainNode {
  if (salida) return salida;
  const master = audio.createGain();
  const compresor = audio.createDynamicsCompressor();
  master.gain.setValueAtTime(0.98, audio.currentTime);
  compresor.threshold.setValueAtTime(-18, audio.currentTime);
  compresor.knee.setValueAtTime(16, audio.currentTime);
  compresor.ratio.setValueAtTime(6, audio.currentTime);
  compresor.attack.setValueAtTime(0.003, audio.currentTime);
  compresor.release.setValueAtTime(0.14, audio.currentTime);
  master.connect(compresor).connect(audio.destination);
  salida = master;
  return master;
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
  oscillator.connect(gain).connect(destino(audio));
  armonico.connect(gainArmonico).connect(destino(audio));
  oscillator.start(start);
  armonico.start(start);
  oscillator.stop(end + 0.02);
  armonico.stop(end + 0.02);
}

/** Programa las campanitas aun si el contexto está terminando de reanudarse. */
function programarTimbre(audio: AudioContext, etapas: readonly EtapaSonora[]) {
  const unicas = ETAPAS_SONORAS.filter((etapa) => etapas.includes(etapa));
  unicas.forEach((etapa, indice) => {
    const inicio = audio.currentTime + 0.025 + indice * 0.6;
    PATRONES[etapa].forEach((nota) => tocarNota(audio, nota, inicio));
  });
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
      // No se espera antes de crear/reanudar el contexto: debe suceder dentro
      // del mismo gesto en Safari y Chrome móvil para que quede autorizado.
      const reanudacion = audio.resume();
      desbloquearAudio(audio);
      await reanudacion;
      const activa = audio.state === 'running';
      if (activa) guardarPreferencia(true);
      return activa;
    } catch {
      return false;
    }
  },

  /**
   * Activación explícita del botón. A diferencia de una reanudación silenciosa,
   * programa una campana dentro del mismo `click`/`touchend`; iPhone exige
   * justamente ese primer audio audible para autorizar los avisos posteriores.
   */
  async activarYProbar(): Promise<boolean> {
    const audio = crearContexto();
    if (!audio) return false;
    try {
      const reanudacion = audio.resume();
      desbloquearAudio(audio);
      programarTimbre(audio, ['PENDIENTE']);
      await reanudacion;
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
    programarTimbre(context, etapas);
  },
};

/**
 * Registra varios gestos compatibles con Safari/Chrome móvil. Se mantiene
 * armado hasta que el navegador confirme que el canal de audio quedó activo.
 */
export function registrarActivacionPorGesto(alActivar?: () => void) {
  if (typeof document === 'undefined' || !preferidas()) return () => {};
  const eventos: Array<keyof DocumentEventMap> = ['pointerdown', 'touchend', 'click', 'keydown'];
  let intentando = false;
  let removido = false;

  const quitar = () => {
    if (removido) return;
    removido = true;
    for (const evento of eventos) document.removeEventListener(evento, intentar, true);
  };
  const intentar = () => {
    if (intentando || removido) return;
    intentando = true;
    void alertasSonoras.activar().then((activo) => {
      intentando = false;
      if (!activo) return;
      alActivar?.();
      quitar();
    });
  };

  for (const evento of eventos) document.addEventListener(evento, intentar, { capture: true, passive: true });
  return quitar;
}
