import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'criaturas' },
  {
    path: 'criaturas',
    title: 'Criaturas · Runegrid',
    loadComponent: () => import('@features/creatures/creatures-page').then((m) => m.CreaturesPage),
  },
  {
    path: 'combate',
    title: 'Combate · Runegrid',
    loadComponent: () => import('@features/combat/combat-page').then((m) => m.CombatPage),
  },
  {
    path: 'gerador',
    title: 'Gerador · Runegrid',
    loadComponent: () => import('@features/generator/generator-page').then((m) => m.GeneratorPage),
  },
  {
    path: 'estudio',
    title: 'Estúdio · Runegrid',
    loadComponent: () => import('@features/studio/studio-page').then((m) => m.StudioPage),
  },
  {
    path: 'bestiario',
    title: 'Bestiário · Runegrid',
    loadComponent: () => import('@features/bestiary/bestiary-page').then((m) => m.BestiaryPage),
  },
  {
    path: 'magias',
    title: 'Magias · Runegrid',
    loadComponent: () => import('@features/spells/spells-page').then((m) => m.SpellsPage),
  },
  {
    path: 'dados',
    title: 'Dados · Runegrid',
    loadComponent: () => import('@features/dice/dice-page').then((m) => m.DicePage),
  },
];
