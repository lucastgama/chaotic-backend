import { Router } from 'express';
import cardsRoutes from './cards.js';
import userRoutes from './user.js';
import collectionsRoutes from './collections.js';
import roomsRoutes from './rooms.js';
import decksRoutes from './decks.js';
import armyRoutes from './army.js';

const router = Router();

router.use('/auth', userRoutes);
router.use('/user', collectionsRoutes);
router.use('/cards', cardsRoutes);
router.use('/rooms', roomsRoutes);
router.use('/decks', decksRoutes);
router.use('/armies', armyRoutes);


export default router;

