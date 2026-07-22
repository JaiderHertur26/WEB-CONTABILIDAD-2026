import localforage from 'localforage';

localforage.config({
    name: 'ContabilidadHertur2026',
    version: 1,
    storeName: 'app_data', // Should be alphanumeric, with underscores.
    description: 'Centralized storage for Hertur2026 App'
});

export default localforage;