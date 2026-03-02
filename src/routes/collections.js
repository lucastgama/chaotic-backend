import { Router } from "express";
import { supabase } from "../config/supabase.js";
import { authenticateToken } from "../middleware/auth.js";

const router = Router();

// GET /user/collection?type=creature&limit=20&offset=0
router.get('/collection', authenticateToken, async (req, res) => {
    const userId = req.user.id;
    const limit  = Math.min(parseInt(req.query.limit)  || 100, 100);
    const offset = parseInt(req.query.offset) || 0;
    const type   = req.query.type;

    try {
        let query = supabase
            .from('user_collection')
            .select(`
                quantity,
                cards_view (
                    card_id, card_type, code, name, image_url,
                    creature_tribe, build_points, mugic_cost,
                    location_initiative, rarity_id
                )
            `)
            .eq('user_id', userId)
            .range(offset, offset + limit - 1)
            .order('name', { referencedTable: 'cards_view', ascending: true });

        if (type) {
            query = query.eq('cards_view.card_type', type);
        }

        const { data, error } = await query;

        if (error) {
            console.error('Error fetching collection:', error);
            return res.status(500).json({ success: false, error: 'Failed to fetch collection.' });
        }

        const filtered = data.filter(row => row.cards_view !== null);

        return res.json({ success: true, total: filtered.length, data: filtered });
    } catch (error) {
        console.error('Error fetching collection:', error);
        return res.status(500).json({ success: false, error: 'Failed to fetch collection.' });
    }
});



export default router;