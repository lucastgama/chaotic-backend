import { Router } from "express";
import { supabase } from "../config/supabase.js";
import { authenticateToken } from "../middleware/auth.js";
import bcrypt from "bcrypt";

const router = Router();

function sanitizeString(str) {
    if (!str) return '';
    return str.toString()
        .trim()
        .replace(/[<>"'&]/g, '')
        .replace(/\s+/g, ' ');
}

function validateRoomName(name) {
    if (!name || typeof name !== 'string') {
        return { valid: false, error: 'Room name is required.' };
    }
    const sanitized = sanitizeString(name);
    if (sanitized.length < 3) {
        return { valid: false, error: 'Room name must be at least 3 characters.' };
    }
    if (sanitized.length > 80) {
        return { valid: false, error: 'Room name must not exceed 80 characters.' };
    }
    if (!/^[a-zA-Z0-9\s\-_]+$/.test(sanitized)) {
        return { valid: false, error: 'Room name contains invalid characters.' };
    }
    return { valid: true, sanitized };
}

function validatePassword(password) {
    if (!password || typeof password !== 'string') {
        return { valid: false, error: 'Password is required for private rooms.' };
    }
    if (password.length < 4) {
        return { valid: false, error: 'Password must be at least 4 characters.' };
    }
    if (password.length > 100) {
        return { valid: false, error: 'Password must not exceed 100 characters.' };
    }
    return { valid: true };
}

router.post('/', authenticateToken, async (req, res) => {
    const { name, battle_mode, is_private, password, max_players } = req.body;
    const userId = req.user.id;

    const nameValidation = validateRoomName(name);
    if (!nameValidation.valid) {
        return res.status(400).json({ success: false, error: nameValidation.error });
    }
    const sanitizedName = nameValidation.sanitized;

    if (!battle_mode || ![1, 3, 6, 10].includes(parseInt(battle_mode))) {
        return res.status(400).json({ success: false, error: 'Invalid battle_mode. Must be 1, 3, 6, or 10.' });
    }

    if (max_players && (max_players < 2 || max_players > 10)) {
        return res.status(400).json({ success: false, error: 'max_players must be between 2 and 10.' });
    }

    try {
        let password_hash = null;
        if (is_private) {
            if (!password) {
                return res.status(400).json({ success: false, error: 'Password required for private rooms.' });
            }
            const passwordValidation = validatePassword(password);
            if (!passwordValidation.valid) {
                return res.status(400).json({ success: false, error: passwordValidation.error });
            }
            password_hash = await bcrypt.hash(password, 10);
        }

        const { data: room, error: roomError } = await supabase
            .from('game_rooms')
            .insert({
                owner_id: userId,
                name: sanitizedName,
                battle_mode: parseInt(battle_mode),
                is_private: is_private || false,
                password_hash,
                max_players: max_players ? parseInt(max_players) : 3,
                current_players: 1
            })
            .select()
            .single();

        if (roomError) {
            console.error('Error creating room:', roomError);
            return res.status(500).json({ success: false, error: 'Failed to create room.' });
        }

        const { error: playerError } = await supabase
            .from('room_players')
            .insert({
                room_id: room.id,
                user_id: userId,
                is_owner: true,
                join_order: 1
            });

        if (playerError) {
            console.error('Error adding owner to room:', playerError);
            await supabase.from('game_rooms').delete().eq('id', room.id);
            return res.status(500).json({ success: false, error: 'Failed to add owner to room.' });
        }

        return res.status(201).json({ success: true, data: room });
    } catch (error) {
        console.error('Error creating room:', error);
        return res.status(500).json({ success: false, error: 'Failed to create room.' });
    }
});

router.get('/', authenticateToken, async (req, res) => {
    const { battle_mode, status } = req.query;

    try {
        let query = supabase
            .from('active_rooms')
            .select('*')
            .order('created_at', { ascending: false });

        if (battle_mode) {
            query = query.eq('battle_mode', parseInt(battle_mode));
        }

        if (status) {
            query = query.eq('status', status);
        }

        const { data, error } = await query;

        if (error) {
            console.error('Error fetching rooms:', error);
            return res.status(500).json({ success: false, error: 'Failed to fetch rooms.' });
        }

        return res.json({ success: true, data });
    } catch (error) {
        console.error('Error fetching rooms:', error);
        return res.status(500).json({ success: false, error: 'Failed to fetch rooms.' });
    }
});

router.get('/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;

    try {
        const { data, error } = await supabase
            .from('active_rooms')
            .select('*')
            .eq('id', id)
            .single();

        if (error || !data) {
            return res.status(404).json({ success: false, error: 'Room not found.' });
        }

        return res.json({ success: true, data });
    } catch (error) {
        console.error('Error fetching room:', error);
        return res.status(500).json({ success: false, error: 'Failed to fetch room.' });
    }
});

router.post('/:id/join', authenticateToken, async (req, res) => {
    const { id } = req.params;
    const { password, deck_id } = req.body;
    const userId = req.user.id;

    try {
        const { data: room, error: roomError } = await supabase
            .from('game_rooms')
            .select('*')
            .eq('id', id)
            .single();

        if (roomError || !room) {
            return res.status(404).json({ success: false, error: 'Room not found.' });
        }

        if (room.status !== 'waiting') {
            return res.status(400).json({ success: false, error: 'Room is not accepting players.' });
        }

        if (room.current_players >= room.max_players) {
            return res.status(400).json({ success: false, error: 'Room is full.' });
        }

        if (room.is_private && room.password_hash) {
            if (!password) {
                return res.status(400).json({ success: false, error: 'Password required for private room.' });
            }
            const passwordValidation = validatePassword(password);
            if (!passwordValidation.valid) {
                return res.status(400).json({ success: false, error: passwordValidation.error });
            }
            const validPassword = await bcrypt.compare(password, room.password_hash);
            if (!validPassword) {
                return res.status(401).json({ success: false, error: 'Invalid password.' });
            }
        }

        const { data: existingPlayer } = await supabase
            .from('room_players')
            .select('*')
            .eq('room_id', id)
            .eq('user_id', userId)
            .is('left_at', null)
            .single();

        if (existingPlayer) {
            return res.status(400).json({ success: false, error: 'Already in this room.' });
        }

        const { data: players } = await supabase
            .from('room_players')
            .select('join_order')
            .eq('room_id', id)
            .order('join_order', { ascending: false })
            .limit(1);

        const nextOrder = players && players.length > 0 ? players[0].join_order + 1 : 1;

        const { data: newPlayer, error: playerError } = await supabase
            .from('room_players')
            .insert({
                room_id: id,
                user_id: userId,
                is_owner: false,
                join_order: nextOrder,
                deck_id: deck_id || null
            })
            .select()
            .single();

        if (playerError) {
            console.error('Error joining room:', playerError);
            return res.status(500).json({ success: false, error: 'Failed to join room.' });
        }

        await supabase
            .from('room_logs')
            .insert({
                room_id: id,
                user_id: userId,
                action: 'joined'
            });

        return res.json({ success: true, data: newPlayer });
    } catch (error) {
        console.error('Error joining room:', error);
        return res.status(500).json({ success: false, error: 'Failed to join room.' });
    }
});

router.post('/:id/leave', authenticateToken, async (req, res) => {
    const { id } = req.params;
    const userId = req.user.id;

    try {
        const { data: room, error: roomError } = await supabase
            .from('game_rooms')
            .select('*, room_players(*)')
            .eq('id', id)
            .single();

        if (roomError || !room) {
            return res.status(404).json({ success: false, error: 'Room not found.' });
        }

        const { data: player } = await supabase
            .from('room_players')
            .select('*')
            .eq('room_id', id)
            .eq('user_id', userId)
            .is('left_at', null)
            .single();

        if (!player) {
            return res.status(400).json({ success: false, error: 'Not in this room.' });
        }

        await supabase
            .from('room_players')
            .update({ left_at: new Date().toISOString() })
            .eq('id', player.id);

        await supabase
            .from('room_logs')
            .insert({
                room_id: id,
                user_id: userId,
                action: 'left'
            });

        if (player.is_owner) {
            await supabase
                .from('game_rooms')
                .update({ 
                    status: 'cancelled',
                    closed_at: new Date().toISOString()
                })
                .eq('id', id);

            await supabase
                .from('room_logs')
                .insert({
                    room_id: id,
                    user_id: userId,
                    action: 'closed',
                    details: { reason: 'owner_left' }
                });

            return res.json({ success: true, message: 'Room closed (owner left).' });
        }

        return res.json({ success: true, message: 'Left room successfully.' });
    } catch (error) {
        console.error('Error leaving room:', error);
        return res.status(500).json({ success: false, error: 'Failed to leave room.' });
    }
});

router.post('/:id/ready', authenticateToken, async (req, res) => {
    const { id } = req.params;
    const { is_ready } = req.body;
    const userId = req.user.id;

    try {
        const { data: player } = await supabase
            .from('room_players')
            .select('*')
            .eq('room_id', id)
            .eq('user_id', userId)
            .is('left_at', null)
            .single();

        if (!player) {
            return res.status(400).json({ success: false, error: 'Not in this room.' });
        }

        const { error: updateError } = await supabase
            .from('room_players')
            .update({ is_ready: is_ready !== false })
            .eq('id', player.id);

        if (updateError) {
            console.error('Error updating ready status:', updateError);
            return res.status(500).json({ success: false, error: 'Failed to update ready status.' });
        }

        await supabase
            .from('room_logs')
            .insert({
                room_id: id,
                user_id: userId,
                action: is_ready === false ? 'unready' : 'ready'
            });

        const { data: readyPlayers } = await supabase
            .from('room_players')
            .select('*')
            .eq('room_id', id)
            .eq('is_ready', true)
            .is('left_at', null);

        if (readyPlayers && readyPlayers.length >= 2) {
            await supabase
                .from('game_rooms')
                .update({ status: 'ready' })
                .eq('id', id);
        }

        return res.json({ success: true, message: 'Ready status updated.' });
    } catch (error) {
        console.error('Error updating ready status:', error);
        return res.status(500).json({ success: false, error: 'Failed to update ready status.' });
    }
});

router.post('/:id/start', authenticateToken, async (req, res) => {
    const { id } = req.params;
    const userId = req.user.id;

    try {
        const { data: room, error: roomError } = await supabase
            .from('game_rooms')
            .select('*')
            .eq('id', id)
            .single();

        if (roomError || !room) {
            return res.status(404).json({ success: false, error: 'Room not found.' });
        }

        if (room.owner_id !== userId) {
            return res.status(403).json({ success: false, error: 'Only room owner can start the game.' });
        }

        if (room.status !== 'ready') {
            return res.status(400).json({ success: false, error: 'Room is not ready to start.' });
        }

        const { data: readyPlayers } = await supabase
            .from('room_players')
            .select('*')
            .eq('room_id', id)
            .eq('is_ready', true)
            .is('left_at', null);

        if (!readyPlayers || readyPlayers.length < 2) {
            return res.status(400).json({ success: false, error: 'Need at least 2 ready players to start.' });
        }

        await supabase
            .from('game_rooms')
            .update({ 
                status: 'in_progress',
                started_at: new Date().toISOString()
            })
            .eq('id', id);

        return res.json({ success: true, message: 'Game started successfully.' });
    } catch (error) {
        console.error('Error starting game:', error);
        return res.status(500).json({ success: false, error: 'Failed to start game.' });
    }
});

router.delete('/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    const userId = req.user.id;

    try {
        const { data: room, error: roomError } = await supabase
            .from('game_rooms')
            .select('*')
            .eq('id', id)
            .single();

        if (roomError || !room) {
            return res.status(404).json({ success: false, error: 'Room not found.' });
        }

        if (room.owner_id !== userId) {
            return res.status(403).json({ success: false, error: 'Only room owner can close the room.' });
        }

        await supabase
            .from('game_rooms')
            .update({ 
                status: 'cancelled',
                closed_at: new Date().toISOString()
            })
            .eq('id', id);

        await supabase
            .from('room_logs')
            .insert({
                room_id: id,
                user_id: userId,
                action: 'closed',
                details: { reason: 'owner_closed' }
            });

        return res.json({ success: true, message: 'Room closed successfully.' });
    } catch (error) {
        console.error('Error closing room:', error);
        return res.status(500).json({ success: false, error: 'Failed to close room.' });
    }
});

router.get('/:id/logs', authenticateToken, async (req, res) => {
    const { id } = req.params;
    const limit = Math.min(parseInt(req.query.limit) || 50, 100);
    const offset = parseInt(req.query.offset) || 0;

    try {
        const { data, error } = await supabase
            .from('room_logs')
            .select('*')
            .eq('room_id', id)
            .order('created_at', { ascending: false })
            .range(offset, offset + limit - 1);

        if (error) {
            console.error('Error fetching logs:', error);
            return res.status(500).json({ success: false, error: 'Failed to fetch logs.' });
        }

        return res.json({ success: true, data });
    } catch (error) {
        console.error('Error fetching logs:', error);
        return res.status(500).json({ success: false, error: 'Failed to fetch logs.' });
    }
});

export default router;
