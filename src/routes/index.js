import { Router } from 'express';
import cardsRoutes from './cards.js';
import userRoutes from './user.js';
import startRoutes from './start_decks.js';

const router = Router();

router.use('/cards', cardsRoutes);
router.use('/users', userRoutes);
router.use('/deck', startRoutes);

export default router;

