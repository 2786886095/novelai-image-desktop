// Regression-only entry: use Vite's same module graph as the production component.
export {default as React} from 'react';
export {createRoot} from 'react-dom/client';
export {TranslationPreview} from '../src/components/TranslationPreview';
export {useAppStore} from '../src/store';
