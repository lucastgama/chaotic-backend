import { Router } from "express";
import { supabase } from "../config/supabase.js";

const router = Router();

router.get('/startdeck/:code', async (req, res) => {

    const { code } = req.params;
    let intCode = parseInt(code);
    try {
        const { data, error } = await supabase.from('starter_decks').select('*').eq('display_order', intCode).single();

        if (error || !data) {
            return res.status(400).json({
                success: false,
                error: 'Invalid start deck code.'
            });
        }
        return res.json({
            success: true,
            data: data
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            error: error.message
        });
    }

});

export default router;