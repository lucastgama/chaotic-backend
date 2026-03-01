import { Router } from "express";
import { supabase } from "../config/supabase.js";

const router = Router();

router.get('/collections/:userId', async (req, res) => {
    const {params} = req.query;

});