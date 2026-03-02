import { Router } from 'express';
import { supabase } from '../config/supabase.js';

const router = Router();

// GET /cards?limit=10&offset=0&type=creature
router.get('/', async (req, res) => {
    try {
        const limit  = Math.min(parseInt(req.query.limit)  || 10, 100);
        const offset = parseInt(req.query.offset) || 0;
        const type   = req.query.type;

        let query = supabase
            .from('cards_view')
            .select('*')
            .range(offset, offset + limit - 1);

        if (type) {
            query = query.eq('card_type', type);
        }

        const { data, error } = await query;

        if (error) {
            console.error('Error fetching cards:', error);
            return res.status(500).json({ success: false, error: 'Failed to fetch cards.' });
        }

        return res.json({ success: true, total: data.length, data });
    } catch (error) {
        console.error('Error fetching cards:', error);
        return res.status(500).json({ success: false, error: 'Failed to fetch cards.' });
    }
});

router.get('/:code', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('cards_view')
            .select('*')
            .eq('code', req.params.code)
            .single();

        if (error) {
            if (error.code === 'PGRST116') {
                return res.status(404).json({ success: false, error: 'Card not found.' });
            }
            console.error('Error fetching card:', error);
            return res.status(500).json({ success: false, error: 'Failed to fetch card.' });
        }

        return res.json({ success: true, data });
    } catch (error) {
        console.error('Error fetching card:', error);
        return res.status(500).json({ success: false, error: 'Failed to fetch card.' });
    }
});


export default router;