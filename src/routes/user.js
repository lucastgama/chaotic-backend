import { Router } from "express";
import bcrypt from "bcrypt";
import { supabase } from "../config/supabase.js";

const router = Router();

router.post('/register', async (req, res) => {
    const { email, nickname, password, startDeckCode } = req.body;

    if (!email || !nickname || !password || !startDeckCode) {
        return res.status(400).json({
            success: false,
            error: 'Email, nickname, password and startDeckCode are required.'
        });
    }

    if (password.length < 6) {
        return res.status(400).json({
            success: false,
            error: 'Password must be at least 6 characters long.'
        });
    }

    if (password.length > 100) {
        return res.status(400).json({
            success: false,
            error: 'Password must be at most 100 characters long.'
        });
    }

    if (nickname.length < 3) {
        return res.status(400).json({
            success: false,
            error: 'Nickname must be at least 3 characters long.'
        });
    }
    if (nickname.length > 30) {
        return res.status(400).json({
            success: false,
            error: 'Nickname must be at most 30 characters long.'
        });
    }
    if (email.length > 255) {
        return res.status(400).json({
            success: false,
            error: 'Email must be long.'
        });
    }
    if (startDeckCode.length > 3) {
        return res.status(400).json({
            success: false,
            error: 'Start deck code must be long.'
        });
    }


    try {
        const { data: startDeck, error: startDeckError } = await supabase
            .from('starter_decks')
            .select('*')
            .eq('display_order', parseInt(startDeckCode))
            .single();

        if (startDeckError || !startDeck) {
            return res.status(400).json({
                success: false,
                error: 'Invalid start deck code.'
            });
        }

        const passwordHash = await bcrypt.hash(password, 10);

        const { data: user, error: userError } = await supabase
            .from('users')
            .insert({
                email,
                nickname,
                password_user: passwordHash
            })
            .select()
            .single();

        if (userError) {
            if (userError.code === '23505') {
                return res.status(400).json({
                    success: false,
                    error: 'Email or nickname already exists.'
                });
            }
            throw userError;
        }

        const { data: userDeck, error: deckError } = await supabase
            .from('decks')
            .insert({
                user_id: user.id,
                name: startDeck.name,
                battle_mode: startDeck.battle_mode,
                is_temporary: false,
            })
            .select()
            .single();

        if (deckError) {
            throw deckError;
        }

        const { data: starterCards, error: starterCardsError } = await supabase
            .from('starter_deck_cards')
            .select('*')
            .eq('starter_deck_id', startDeck.id);

        if (starterCardsError) {
            throw starterCardsError;
        }

        if (starterCards && starterCards.length > 0) {
            const deckCards = starterCards.map(card => ({
                deck_id: userDeck.id,
                card_id: card.card_id,
                position: card.position,
                slot_order: card.slot_order
            }));

            const { error: deckCardsError } = await supabase
                .from('deck_cards')
                .insert(deckCards);

            if (deckCardsError) {
                throw deckCardsError;
            }

            const collectionMap = {};
            starterCards.forEach(card => {
                const key = card.card_id;
                if (!collectionMap[key]) {
                    collectionMap[key] = {
                        user_id: user.id,
                        card_id: card.card_id,
                        quantity: 0
                    };
                }
                collectionMap[key].quantity += card.quantity_for_collection || 1;
            });

            const collectionCards = Object.values(collectionMap);

            const { error: collectionError } = await supabase
                .from('user_collection')
                .insert(collectionCards);

            if (collectionError) {
                throw collectionError;
            }
        }

        const userResponse = {
            id: user.id,
            email: user.email,
            nickname: user.nickname,
            perim_coins: user.perim_coins,
            perim_gems: user.perim_gems,
            level: user.level,
            experience: user.experience,
            created_at: user.created_at
        };

        return res.status(201).json({
            success: true,
            data: {
                user: userResponse,
                deck: {
                    id: userDeck.id,
                    name: userDeck.name,
                    battle_mode: userDeck.battle_mode
                }
            }
        });

    } catch (error) {
        console.error('Registration error:', error);
        return res.status(500).json({
            success: false,
            error: 'An error occurred during registration.'
        });
    }
});

export default router;

/*{
    "success": true,
    "data": [
        {
            "email": "test@chaotic.com",
            "nickname": "uuussaaa",
            "perim_coins": 1000,
            "perim_gems": 50,
            "equipped_title_id": null,
            "equipped_avatar_id": null,
            "quest_points": 0,
            "level": 1,
            "experience": 0,
            "created_at": "2026-02-19T23:31:14.730603+00:00",
            "updated_at": "2026-02-19T23:31:14.730603+00:00",
            "password_user": "senha123"
        }
    ]
} */