import React from 'react';
import {createRoot} from 'react-dom/client';
import RandomArtistLab from '../src/RandomArtistLab';
import {useAppStore} from '../src/store';
import {DEFAULT_PARAMS} from '../src/types';
import '../src/styles.css';

const calls: any[] = [];
const catalog = {id: 'fixture-catalog', savedAt: 1, total: 60, count: 60, mode: 'random', seed: 1, source: 'bundled'};
const pool = Array.from({length: 60}, (_, i) => ({id: i + 1, name: 'artist_' + i, postCount: 600 - i, category: 1}));
const api: any = {
  artistLabCatalogSelect: async () => ({items: pool, catalog, mode: "random", requested: 60, seed: 1}),
  artistLabCatalogLatest: async () => catalog,
  onArtistPoolSyncProgress: () => () => {},
  artistLabCatalogCancel: async () => {},
  artistLabDeleteTemporary: async () => ({ok: true}),
  generateArtistLab: async (params: any, extras: any, mode: string) => {
    calls.push({params: structuredClone(params), extras, mode});
    return {ok: false, items: [], message: 'read-only test intercepted request; no API called'};
  },
  getArtistFavorites: async () => [],
};
window.naiDesktop = api;
useAppStore.setState({settings: {language: 'zh-CN'} as any, params: {...DEFAULT_PARAMS, positivePrompt: '1girl, portrait'}, refreshAccount: async () => {}, refreshHistory: async () => {}, deleteHistory: async () => {}} as any);
(window as any).qa = {calls};
createRoot(document.getElementById('root')!).render(<RandomArtistLab onBack={() => {}}/>);
