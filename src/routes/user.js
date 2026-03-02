import { Router } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { supabase } from "../config/supabase.js";
import { authenticateToken } from "../middleware/auth.js";

const router = Router();

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_REGEX = /^[a-zA-Z0-9_]+$/;

router.post('/register', async (req, res) => {
    const rawEmail = req.body.email;
    const rawUsername = req.body.username;
    const password = req.body.password;
    const startDeckCode = req.body.startDeckCode;

    if (!rawEmail || !rawUsername || !password || startDeckCode == null) {
        return res.status(400).json({
            success: false,
            error: 'Email, username, password and startDeckCode are required.'
        });
    }

    const email = String(rawEmail).trim().toLowerCase();
    const username = String(rawUsername).trim();
    const deckNum = parseInt(startDeckCode, 10);

    if (!EMAIL_REGEX.test(email) || email.length > 255) {
        return res.status(400).json({ success: false, error: 'Invalid email address.' });
    }

    if (username.length < 3 || username.length > 30) {
        return res.status(400).json({ success: false, error: 'Username must be between 3 and 30 characters.' });
    }
    if (!USERNAME_REGEX.test(username)) {
        return res.status(400).json({ success: false, error: 'Username may only contain letters, numbers and underscores.' });
    }

    if (password.length < 6 || password.length > 100) {
        return res.status(400).json({ success: false, error: 'Password must be between 6 and 100 characters.' });
    }

    if (isNaN(deckNum) || deckNum < 1) {
        return res.status(400).json({ success: false, error: 'Invalid start deck code.' });
    }


    try {
        const { data: startDeck, error: startDeckError } = await supabase
            .from('starter_decks')
            .select('*')
            .eq('display_order', deckNum)
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
                username,
                password_hash: passwordHash
            })
            .select()
            .single();

        if (userError) {
            if (userError.code === '23505') {
                return res.status(409).json({
                    success: false,
                    error: 'Email or username already in use.'
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
            await supabase.from('users').delete().eq('id', user.id);
            throw deckError;
        }

        const { data: noviceTitle } = await supabase
            .from('titles')
            .select('id')
            .eq('code', 'novice_player')
            .single();

        if (noviceTitle) {
            await supabase.from('user_titles').insert({
                user_id: user.id,
                title_id: noviceTitle.id,
            });
            await supabase
                .from('users')
                .update({ equipped_title_id: noviceTitle.id })
                .eq('id', user.id);
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
                await supabase.from('users').delete().eq('id', user.id);
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
                await supabase.from('users').delete().eq('id', user.id);
                throw collectionError;
            }
        }

        const token = jwt.sign(
            { id: user.id, email: user.email, username: user.username },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );

        const userResponse = {
            id: user.id,
            email: user.email,
            username: user.username,
            perim_coins: user.perim_coins,
            perim_gems: user.perim_gems,
            equipped_title: noviceTitle?.id ?? null,
            created_at: user.created_at
        };

        return res.status(201).json({
            success: true,
            data: {
                token,
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

router.post('/login', async (req, res) => {
    const rawIdentifier = req.body.username;
    const password = req.body.password;

    if (!rawIdentifier || !password) {
        return res.status(400).json({ success: false, error: 'Identifier and password are required.' });
    }

    const identifier = String(rawIdentifier).trim().toLowerCase();

    try {
        const { data: user, error } = await supabase
            .from('users')
            .select(`
                id, email, username, password_hash,
                avatar_url, character_model,
                perim_coins, perim_gems,
                elo, rank_name,
                wins, losses,
                win_rate, reputation_status,
                equipped_title_id,
                is_banned
            `)
            .eq("username", identifier)
            .single();

        if (error || !user) {
            return res.status(401).json({ success: false, error: error });
        }

        if (user.is_banned) {
            const permanent = !user.ban_expires_at;
            const expired = user.ban_expires_at && new Date(user.ban_expires_at) < new Date();

            if (!expired) {
                return res.status(403).json({
                    success: false,
                    error: permanent ? 'Account is permanently banned.' : `Account is banned until ${user.ban_expires_at}.`
                });
            }
        }

        const passwordMatch = await bcrypt.compare(password, user.password_hash);
        if (!passwordMatch) {
            return res.status(401).json({ success: false, error: 'Invalid credentials.' });
        }

        const token = jwt.sign(
            { id: user.id, email: user.email, username: user.username },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );

        const { password_hash, ...userResponse } = user;

        return res.json({ success: true, data: { token, user: userResponse } });

    } catch (err) {
        console.error('Login error:', err);
        return res.status(500).json({ success: false, error: 'An error occurred during login.' });
    }
});

export default router;