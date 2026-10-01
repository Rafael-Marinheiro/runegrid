/**
 * Unidades de distância. O motor trabalha em pés (5 ft por casa); em pt-BR a interface mostra
 * metros, na convenção das edições brasileiras: 5 ft = 1,5 m (1 ft = 0,3 m), 1 milha = 1,6 km.
 */
import { T } from './i18n';

const M_PER_FT = 0.3;
const KM_PER_MILE = 1.6;

const decimal = (n: number, comma: boolean): string => {
  const s = String(Math.round(n * 10) / 10);
  return comma ? s.replace('.', ',') : s;
};

/** Pés → metros, com vírgula decimal ("1,5"). */
export const feetToMeters = (ft: number): string => decimal(ft * M_PER_FT, true);

/** Distância no idioma pedido: `30 ft` em inglês, `9 m` em pt-BR. */
export const distance = (ft: number, lang: 'pt' | 'en'): string =>
  lang === 'en' ? `${ft} ft` : `${feetToMeters(ft)} m`;

/** Distância para o registro e os erros do motor (as duas versões). */
export const distT = (ft: number): string => T(distance(ft, 'pt'), distance(ft, 'en'));

/** Troca "30 ft", "30 feet", "1 mile" de um texto por metros/quilômetros (texto em pt-BR). */
export function ptUnits(text: string): string {
  return text
    .replace(/(\d+(?:[.,]\d+)?)[- ]?(?:ft\.?|feet|foot)(?![a-z])/gi, (_, n: string) => {
      const ft = Number(n.replace(',', '.'));
      return `${feetToMeters(ft)} m`;
    })
    .replace(/(\d+(?:[.,]\d+)?)[- ]?miles?/gi, (_, n: string) => {
      return `${decimal(Number(n.replace(',', '.')) * KM_PER_MILE, true)} km`;
    });
}
