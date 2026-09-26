import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'dados' },
  {
    path: 'dados',
    title: 'Dados · Runegrid',
    loadComponent: () => import('@features/dice/dice-page').then((m) => m.DicePage),
  },
];
