import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'criaturas' },
  {
    path: 'criaturas',
    title: 'Criaturas · Runegrid',
    loadComponent: () => import('@features/creatures/creatures-page').then((m) => m.CreaturesPage),
  },
  {
    path: 'dados',
    title: 'Dados · Runegrid',
    loadComponent: () => import('@features/dice/dice-page').then((m) => m.DicePage),
  },
];
