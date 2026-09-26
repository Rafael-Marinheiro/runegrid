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
    path: 'dados',
    title: 'Dados · Runegrid',
    loadComponent: () => import('@features/dice/dice-page').then((m) => m.DicePage),
  },
];
