import { Router } from 'express';
import { supabase } from '../config/supabase.js';

const router = Router();

//teste

router.get('/creatures', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('creatures')
            .select('*');

        if (error) {
            return res.status(400).json({
                success: false,
                error: error.message
            });
        }

        return res.json({
            success: true,
            data: data
        });
    } catch (err) {
        return res.status(500).json({
            success: false,
            error: err.message
        });
    }
});

router.get('/attacks', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('attacks')
            .select('*');

        if (error) {
            return res.status(400).json({
                success: false,
                error: error.message
            });
        }

        return res.json({
            success: true,
            data: data
        });
    } catch (err) {
        return res.status(500).json({
            success: false,
            error: err.message
        });
    }
});

router.get('/battlegears', async (req, res) => {
    try {
        const { data, error } = await supabase.from('battlegears').select('*');

        if (error) {
            return res.status(400).json({
                success: false,
                error: error.message
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

router.get('/locations', async (req, res) => {
    try {
        const { data, error } = await supabase.from('locations').select('*');
        if (error) {
            return res.status(400).json({
                success: false,
            });
        }
        return res.json({
            success: true,
            data: data
        });
    } catch (error) {
        return res.status(500).json({
            success: false, error: error.message
        });
    }
});

router.get('/mugic/:code', async (req, res) => {
    const { code } = req.params;
    if (!code) {
        return res.status(400).json({
            success: false, error: 'Código da mugic é obrigatório'
        });
    }

    try {
        const { data, error } = await supabase.from('mugics').select('*').eq('code', code);
        if (error) {
            return res.status(400).json({
                success: false,
            });
        }
        return res.json({
            success: true,
            data: data
        });
    } catch (error) {
        return res.status(500).json({
            success: false, error: error.message
        });
    }
});

router.get('/mugics', async (req, res) => {
    try {
        const { data, error } = await supabase.from('mugics').select('*');
        if (error) {
            return res.status(400).json({
                success: false,
            });
        }
        return res.json({
            success: true,
            data: data
        });
    } catch (error) {
        return res.status(500).json({
            success: false, error: error.message
        });
    }
});
export default router;