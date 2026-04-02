import { Router } from "express";
import { supabase } from "../config/supabase.js";
import { authenticateToken } from "../middleware/auth.js";

const router = Router();

router.get('/', authenticateToken, async (req, res) => {
    const userId = req.user.id;
    const { battle_mode } = req.query;

    try {
        let query = supabase
            .from('decks')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false });

        if (battle_mode) {
            query = query.eq('battle_mode', parseInt(battle_mode));
        }

        const { data, error } = await query;

        if (error) {
            console.error('Error fetching decks:', error);
            return res.status(500).json({ success: false, error: 'Failed to fetch decks.' });
        }

        return res.json({ success: true, data });
    } catch (error) {
        console.error('Error fetching decks:', error);
        return res.status(500).json({ success: false, error: 'Failed to fetch decks.' });
    }
});

router.get('/:id', authenticateToken, async (req, res) => {
    const userId = req.user.id;
    const { id } = req.params;

    try {
        const { data: deck, error: deckError } = await supabase
            .from('decks')
            .select('*')
            .eq('id', id)
            .eq('user_id', userId)
            .single();

        if (deckError || !deck) {
            return res.status(404).json({ success: false, error: 'Deck not found.' });
        }

        const { data: cards, error: cardsError } = await supabase
            .from('deck_cards')
            .select(`
                id,
                position,
                slot_order,
                cards_view (
                    card_id, card_type, code, name, image_url,
                    creature_tribe, build_points, mugic_cost,
                    location_initiative, rarity_id,
                    creature_courage, creature_power, creature_wisdom, creature_speed, creature_energy,
                    attack_bp_cost, attack_damage, attack_elements
                )
            `)
            .eq('deck_id', id)
            .order('position')
            .order('slot_order');

        if (cardsError) {
            console.error('Error fetching deck cards:', cardsError);
            return res.status(500).json({ success: false, error: 'Failed to fetch deck cards.' });
        }

        return res.json({ 
            success: true, 
            data: {
                ...deck,
                cards: cards.filter(c => c.cards_view !== null)
            }
        });
    } catch (error) {
        console.error('Error fetching deck:', error);
        return res.status(500).json({ success: false, error: 'Failed to fetch deck.' });
    }
});

router.post('/temp', authenticateToken, async (req, res) => {
    const userId = req.user.id;
    const { battle_mode } = req.body;

    if (!battle_mode || ![1, 3, 6, 10].includes(parseInt(battle_mode))) {
        return res.status(400).json({ success: false, error: 'Valid battle_mode required (1, 3, 6, or 10).' });
    }

    try {
        const { data: existingTemp } = await supabase
            .from('decks')
            .select('id')
            .eq('user_id', userId)
            .eq('is_temporary', true)
            .single();

        if (existingTemp) {
            await supabase
                .from('deck_cards')
                .delete()
                .eq('deck_id', existingTemp.id);

            await supabase
                .from('decks')
                .update({ 
                    battle_mode: parseInt(battle_mode),
                    updated_at: new Date().toISOString()
                })
                .eq('id', existingTemp.id);

            const { data: deck } = await supabase
                .from('decks')
                .select('*')
                .eq('id', existingTemp.id)
                .single();

            return res.json({ success: true, data: deck });
        }

        const { data: deck, error: deckError } = await supabase
            .from('decks')
            .insert({
                user_id: userId,
                name: 'Temporary Deck',
                battle_mode: parseInt(battle_mode),
                is_temporary: true,
                is_valid: false
            })
            .select()
            .single();

        if (deckError) {
            console.error('Error creating temp deck:', deckError);
            return res.status(500).json({ success: false, error: 'Failed to create temp deck.' });
        }

        return res.status(201).json({ success: true, data: deck });
    } catch (error) {
        console.error('Error creating temp deck:', error);
        return res.status(500).json({ success: false, error: 'Failed to create temp deck.' });
    }
});

router.post('/', authenticateToken, async (req, res) => {
    const userId = req.user.id;
    const { name, battle_mode, description } = req.body;

    if (!name || name.trim().length < 3 || name.trim().length > 50) {
        return res.status(400).json({ success: false, error: 'Deck name must be 3-50 characters.' });
    }

    if (!battle_mode || ![1, 3, 6, 10].includes(parseInt(battle_mode))) {
        return res.status(400).json({ success: false, error: 'Valid battle_mode required (1, 3, 6, or 10).' });
    }

    try {
        const { data: deck, error: deckError } = await supabase
            .from('decks')
            .insert({
                user_id: userId,
                name: name.trim(),
                battle_mode: parseInt(battle_mode),
                is_temporary: false,
                is_valid: false,
                description: description || null
            })
            .select()
            .single();

        if (deckError) {
            console.error('Error creating deck:', deckError);
            return res.status(500).json({ success: false, error: 'Failed to create deck.' });
        }

        return res.status(201).json({ success: true, data: deck });
    } catch (error) {
        console.error('Error creating deck:', error);
        return res.status(500).json({ success: false, error: 'Failed to create deck.' });
    }
});

router.put('/:id/cards', authenticateToken, async (req, res) => {
    const userId = req.user.id;
    const { id } = req.params;
    const { card_id, position, slot_order } = req.body;

    if (!card_id || !position) {
        return res.status(400).json({ success: false, error: 'card_id and position are required.' });
    }

    try {
        const { data: deck } = await supabase
            .from('decks')
            .select('*')
            .eq('id', id)
            .eq('user_id', userId)
            .single();

        if (!deck) {
            return res.status(404).json({ success: false, error: 'Deck not found.' });
        }

        const { data: owned } = await supabase
            .from('user_collection')
            .select('quantity')
            .eq('user_id', userId)
            .eq('card_id', card_id)
            .single();

        if (!owned || owned.quantity < 1) {
            return res.status(400).json({ success: false, error: 'Card not in your collection.' });
        }

        const { data: existing } = await supabase
            .from('deck_cards')
            .select('id')
            .eq('deck_id', id)
            .eq('position', position)
            .eq('slot_order', slot_order || null)
            .maybeSingle();

        if (existing) {
            const { error: updateError } = await supabase
                .from('deck_cards')
                .update({ card_id })
                .eq('id', existing.id);

            if (updateError) {
                console.error('Error updating deck card:', updateError);
                return res.status(500).json({ success: false, error: 'Failed to update card.' });
            }
        } else {
            const { error: insertError } = await supabase
                .from('deck_cards')
                .insert({
                    deck_id: id,
                    card_id,
                    position,
                    slot_order: slot_order || null
                });

            if (insertError) {
                console.error('Error adding card to deck:', insertError);
                return res.status(500).json({ success: false, error: insertError.message || 'Failed to add card.' });
            }
        }

        await supabase
            .from('decks')
            .update({ updated_at: new Date().toISOString() })
            .eq('id', id);

        return res.json({ success: true, message: 'Card added/updated successfully.' });
    } catch (error) {
        console.error('Error updating deck cards:', error);
        return res.status(500).json({ success: false, error: error.message || 'Failed to update deck cards.' });
    }
});

router.delete('/:id/cards/:cardEntryId', authenticateToken, async (req, res) => {
    const userId = req.user.id;
    const { id, cardEntryId } = req.params;

    try {
        const { data: deck } = await supabase
            .from('decks')
            .select('user_id')
            .eq('id', id)
            .single();

        if (!deck || deck.user_id !== userId) {
            return res.status(404).json({ success: false, error: 'Deck not found.' });
        }

        const { error: deleteError } = await supabase
            .from('deck_cards')
            .delete()
            .eq('id', cardEntryId)
            .eq('deck_id', id);

        if (deleteError) {
            console.error('Error removing card from deck:', deleteError);
            return res.status(500).json({ success: false, error: 'Failed to remove card.' });
        }

        await supabase
            .from('decks')
            .update({ updated_at: new Date().toISOString() })
            .eq('id', id);

        return res.json({ success: true, message: 'Card removed successfully.' });
    } catch (error) {
        console.error('Error removing card:', error);
        return res.status(500).json({ success: false, error: 'Failed to remove card.' });
    }
});

router.post('/:id/save', authenticateToken, async (req, res) => {
    const userId = req.user.id;
    const { id } = req.params;
    const { name, description } = req.body;

    if (!name || name.trim().length < 3 || name.trim().length > 50) {
        return res.status(400).json({ success: false, error: 'Deck name must be 3-50 characters.' });
    }

    try {
        const { data: deck } = await supabase
            .from('decks')
            .select('*')
            .eq('id', id)
            .eq('user_id', userId)
            .eq('is_temporary', true)
            .single();

        if (!deck) {
            return res.status(404).json({ success: false, error: 'Temporary deck not found.' });
        }

        const { data: savedDeck, error: saveError } = await supabase
            .from('decks')
            .update({
                name: name.trim(),
                description: description || null,
                is_temporary: false,
                updated_at: new Date().toISOString()
            })
            .eq('id', id)
            .select()
            .single();

        if (saveError) {
            console.error('Error saving deck:', saveError);
            return res.status(500).json({ success: false, error: saveError.message || 'Failed to save deck.' });
        }

        return res.json({ success: true, data: savedDeck });
    } catch (error) {
        console.error('Error saving deck:', error);
        return res.status(500).json({ success: false, error: 'Failed to save deck.' });
    }
});

router.delete('/:id', authenticateToken, async (req, res) => {
    const userId = req.user.id;
    const { id } = req.params;

    try {
        const { data: deck } = await supabase
            .from('decks')
            .select('user_id')
            .eq('id', id)
            .single();

        if (!deck || deck.user_id !== userId) {
            return res.status(404).json({ success: false, error: 'Deck not found.' });
        }

        const { error: deleteError } = await supabase
            .from('decks')
            .delete()
            .eq('id', id);

        if (deleteError) {
            console.error('Error deleting deck:', deleteError);
            return res.status(500).json({ success: false, error: 'Failed to delete deck.' });
        }

        return res.json({ success: true, message: 'Deck deleted successfully.' });
    } catch (error) {
        console.error('Error deleting deck:', error);
        return res.status(500).json({ success: false, error: 'Failed to delete deck.' });
    }
});

export default router;
