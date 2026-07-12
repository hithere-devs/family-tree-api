/**
 * One-shot full layout recompute (all components, islands included).
 * Usage: npm run recompute-layout
 */
import { recomputeLayout } from '../services/layout-service.js';

recomputeLayout()
    .then((result) => {
        console.log('Layout recomputed:', result);
        process.exit(0);
    })
    .catch((err) => {
        console.error('Layout recompute failed:', err);
        process.exit(1);
    });
